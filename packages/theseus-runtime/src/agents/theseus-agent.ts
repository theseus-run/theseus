/**
 * TheseusAgent — the root coordinator agent (LLM-powered).
 *
 * Theseus maintains mission context, talks to the user, and delegates to
 * specialist leaf agents via a single generic `delegate(agent_id, instruction)`
 * tool. New agents can be added to the leaf-agent list without ever changing
 * the tool definition — the system prompt is built dynamically from the
 * registered agent list at startup.
 *
 * Mission loop (enforced via system prompt):
 *   1. User gives mission
 *   2. Theseus calls delegate(atlas, …) → implementation plan
 *   3. Theseus presents plan → ends turn (finish_reason: stop)
 *   4. User confirms
 *   5. Theseus calls delegate(forge-1, …) → Forge implements
 *   6. Theseus summarises → TheseusResponse
 *
 * Messages accepted:
 *   Start    — initialise (spawn leaf agents, enter dispatch loop)
 *   Dispatch — new user instruction; triggers one full LLM turn
 *   Steer    — mid-session guidance; treated as a new user message
 */
import { Cause, Deferred, Effect, Queue, Ref } from "effect";
import type { AgentId as AgentIdType } from "../agent.ts";
import { AgentId, BaseAgent } from "../agent.ts";
import type { ChatMessage, ToolDefinition } from "../llm/index.ts";
import { AgentRegistry } from "../registry.ts";
import type { UIEvent } from "../runtime-bus.ts";
import type { RegisteredTool } from "../tools/index.ts";
import type { CallLLM } from "./persistent-agent.ts";
import { PersistentAgent } from "./persistent-agent.ts";

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type TheseusMsg =
  | { readonly _tag: "Start" }
  | { readonly _tag: "Dispatch"; readonly instruction: string }
  | { readonly _tag: "Steer"; readonly guidance: string };

export interface TheseusState {
  readonly conversationHistory: ReadonlyArray<ChatMessage>;
  readonly tasksCompleted: number;
}

// ---------------------------------------------------------------------------
// Leaf agent config — drives both spawn and system-prompt generation
// ---------------------------------------------------------------------------

interface LeafAgentConfig {
  readonly id: AgentIdType;
  /** One-line role description shown in Theseus's system prompt. */
  readonly role: string;
  readonly systemPrompt: string;
  /** Tools this agent is allowed to use. Atlas gets read-only tools; Forge gets the full set. */
  readonly tools: ReadonlyArray<RegisteredTool>;
  /**
   * When true, the agent's raw response is emitted as an AgentResponse
   * UIEvent so the interface layer can display it alongside TheseusResponse.
   * Set to false for planning agents whose output Theseus synthesises for the user.
   */
  readonly showOutput: boolean;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const ATLAS_SYSTEM_PROMPT = `You are Atlas, the architect and planner in the Theseus system.

Theseus is your coordinator — it dispatches planning tasks to you.

Your role is to read the codebase and produce clear, actionable implementation plans.
You are READ-ONLY — you must NEVER edit files or run state-changing commands.

You have access to tools to read and navigate the codebase:
- readFile: read any file by path
- listDir: list directory contents
- findReferences: semantic TypeScript symbol lookup
- shell: run READ-ONLY shell commands (grep, git log, git diff, etc.)
  NEVER run: git commit, git push, bun install, file writes, or any mutating command

Planning strategy:
- Explore the codebase to understand relevant files and existing patterns
- Identify exactly which files need to change and how
- Produce a concrete, step-by-step plan with file paths and line references

Be thorough but concise. Your output is a plan, not an implementation.`;

const FORGE_SYSTEM_PROMPT = `You are Forge, a coding agent in the Theseus system.

Theseus is your coordinator — it dispatches tasks to you and relays your results back to the user.

You have access to tools to read, edit, and navigate the codebase:
- readFile: read any file by path
- listDir: list directory contents
- searchReplace: edit a file by exact text replacement (auto-checks types after write)
- findReferences: semantic TypeScript symbol lookup — find all usages by name
- shell: run shell commands (bun test, git diff, grep, etc.)

Navigation strategy:
- Use shell+grep for distinctive names (class names, unique identifiers) — it is 50-100x faster
- Use findReferences when the symbol name is short or generic and grep would return too much noise

Editing rules (critical — follow these to avoid retry spirals):
- Always readFile before the first searchReplace on any file
- After a successful searchReplace the tool response includes the updated file content around
  the change — use that as your new snapshot; do NOT call readFile again before the next edit
  to the same file unless a tool error occurred
- After searchReplace, fix any type errors reported before moving on
- If searchReplace returns "search text not found", the full current file is shown in the error —
  find your intended block there and retry with the exact text

Be concise in your final response — summarise the key changes made.`;

// ---------------------------------------------------------------------------
// Single generic delegation tool
//
// Agent names are parameters, not tool names — adding a new leaf agent only
// requires updating the system prompt, never the tool definitions.
// ---------------------------------------------------------------------------

const DELEGATE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "delegate",
    description:
      "Delegate a task to a specialist leaf agent and return its final response. " +
      "Use this to consult Atlas for planning or dispatch Forge for implementation. " +
      "The agent_id must match one of the available agents listed in your system prompt.",
    parameters: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The ID of the agent to delegate to (e.g. 'atlas', 'forge-1').",
        },
        instruction: {
          type: "string",
          description:
            "The full instruction to send to the agent. " +
            "Be specific and include all context the agent needs to complete the task independently.",
        },
      },
      required: ["agent_id", "instruction"],
    },
  },
};

// ---------------------------------------------------------------------------
// Dynamic system prompt — built from the actual spawned-agent list
// ---------------------------------------------------------------------------

function buildTheseusSystemPrompt(leafAgents: ReadonlyArray<LeafAgentConfig>): string {
  const agentLines = leafAgents.map((a) => `  ${String(a.id).padEnd(10)} — ${a.role}`).join("\n");

  return `You are Theseus, the root coordinator in an agentic coding system.

You are the user-facing agent. You maintain the mission context across turns, converse with the user in plain language, and delegate specialist work to leaf agents via the \`delegate\` tool.

Available agents:
${agentLines}

Mission loop — follow this strictly:
1. When the user gives you a mission, analyse it carefully.
2. Call delegate("atlas", …) with a detailed instruction to get an implementation plan.
3. Present Atlas's plan to the user clearly and concisely. END YOUR TURN HERE — stop after presenting the plan. Do NOT call delegate("forge-1", …) yet.
4. Wait for the user to confirm, correct, or expand on the plan in their next message.
5. Once the user confirms, call delegate("forge-1", …) with a precise implementation instruction that includes the full agreed plan.
6. After Forge completes, summarise the changes made and report back to the user.

Critical constraints:
- NEVER call delegate("forge-1", …) in the same turn as delegate("atlas", …). Always wait for user confirmation between planning and implementation.
- You may call delegate("atlas", …) multiple times to refine the plan if the user requests changes.
- For conversational messages (greetings, clarifications, minor guidance) you do not need to consult Atlas — respond directly.
- Be concise and direct. The user is a developer.`;
}

// ---------------------------------------------------------------------------
// Rolling history window
// ---------------------------------------------------------------------------

const MAX_HISTORY = 80;

const trimHistory = <T>(arr: ReadonlyArray<T>): ReadonlyArray<T> =>
  arr.length > MAX_HISTORY ? arr.slice(arr.length - MAX_HISTORY) : arr;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class TheseusAgent extends BaseAgent<TheseusMsg, TheseusState> {
  readonly id = AgentId("theseus");
  readonly initialState: TheseusState = {
    conversationHistory: [],
    tasksCompleted: 0,
  };

  private readonly _callLLM: CallLLM;
  private readonly _leafTools: {
    readonly atlas: ReadonlyArray<RegisteredTool>;
    readonly forge: ReadonlyArray<RegisteredTool>;
  };
  private readonly _uiEvents: Queue.Queue<UIEvent>;

  constructor(
    callLLM: CallLLM,
    leafTools: {
      readonly atlas: ReadonlyArray<RegisteredTool>;
      readonly forge: ReadonlyArray<RegisteredTool>;
    },
    uiEvents: Queue.Queue<UIEvent>,
  ) {
    super();
    this._callLLM = callLLM;
    this._leafTools = leafTools;
    this._uiEvents = uiEvents;
  }

  override run(): Effect.Effect<never, never, never> {
    const self = this;

    const push = (event: UIEvent): Effect.Effect<void> => Queue.offer(self._uiEvents, event);

    return Effect.gen(function* () {
      yield* Queue.take(self._inbox); // consume Start

      const registry = yield* AgentRegistry;

      // ------------------------------------------------------------------
      // Leaf agent registry — add new agents here; system prompt updates
      // automatically, no tool changes ever needed.
      // ------------------------------------------------------------------
      const leafAgents: ReadonlyArray<LeafAgentConfig> = [
        {
          id: AgentId("atlas"),
          role: "architect/planner — reads the codebase and produces implementation plans (read-only)",
          systemPrompt: ATLAS_SYSTEM_PROMPT,
          tools: self._leafTools.atlas,
          showOutput: false, // Atlas output is synthesised by Theseus; no raw display
        },
        {
          id: AgentId("forge-1"),
          role: "coding agent — implements changes, edits files, runs tests",
          systemPrompt: FORGE_SYSTEM_PROMPT,
          tools: self._leafTools.forge,
          showOutput: true, // Show raw implementation output alongside Theseus's summary
        },
      ];

      // Spawn all leaf agents
      for (const cfg of leafAgents) {
        yield* registry.spawn(
          new PersistentAgent(cfg.id, self._callLLM, cfg.systemPrompt, cfg.tools, self._uiEvents),
        );
      }

      // Build a lookup map: agentId → config (for O(1) access in consultAgent)
      const leafAgentMap = new Map(leafAgents.map((a) => [String(a.id), a]));

      // Build Theseus's system prompt from the live agent list
      const THESEUS_SYSTEM_PROMPT = buildTheseusSystemPrompt(leafAgents);
      yield* push({ _tag: "StatusChange", agentId: "theseus", status: "idle", ts: Date.now() });
      for (const cfg of leafAgents) {
        yield* push({ _tag: "StatusChange", agentId: cfg.id, status: "idle", ts: Date.now() });
      }

      yield* self.log(`ready | leaf agents: ${leafAgents.map((a) => a.id).join(", ")}`);

      let taskCounter = 0;

      // ----------------------------------------------------------------
      // consultAgent — blocking delegation to one leaf agent.
      //
      // 1. Emits StatusChange(agentId, "working") for the leaf
      // 2. Creates a Deferred<string> and sends Task{taskId, instruction, reply}
      // 3. Awaits Deferred.await(reply) — PersistentAgent resolves it when done
      // 4. Emits StatusChange(agentId, "idle")
      // 5. For agents with showOutput: true, emits AgentResponse (raw output alongside TheseusResponse)
      // ----------------------------------------------------------------
      const consultAgent = (agentId: AgentIdType, instruction: string): Effect.Effect<string> =>
        Effect.gen(function* () {
          taskCounter++;
          const taskId = `task-${String(taskCounter).padStart(3, "0")}`;

          yield* push({
            _tag: "StatusChange",
            agentId,
            status: "working",
            currentTask: taskId,
            ts: Date.now(),
          });
          yield* self.log(
            `delegate → ${agentId} | ${taskId}: ${instruction.slice(0, 80)}${instruction.length > 80 ? "…" : ""}`,
          );

          const reply = yield* Deferred.make<string>();

          yield* self.send(agentId, {
            _tag: "Task",
            taskId,
            instruction,
            reply,
          });

          const finalResponse = yield* Deferred.await(reply);

          yield* push({ _tag: "StatusChange", agentId, status: "idle", ts: Date.now() });

          // Emit raw agent output for agents with showOutput: true
          const cfg = leafAgentMap.get(String(agentId));
          if (cfg?.showOutput) {
            yield* push({
              _tag: "AgentResponse",
              agentId: String(agentId),
              taskId,
              content: finalResponse,
              ts: Date.now(),
            });
          }

          yield* self.log(`delegate ← ${agentId} | ${taskId} done (${finalResponse.length} chars)`);

          return finalResponse;
        });

      // ----------------------------------------------------------------
      // runLLMTurn — one full Theseus LLM turn for a given user message.
      //
      // Appends the user message to conversationHistory, then runs the
      // tool-calling loop until finish_reason === "stop" or "error".
      // Emits TheseusResponse + StatusChange("theseus", "idle") when done.
      // ----------------------------------------------------------------
      const runLLMTurn = (userMessage: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* push({
            _tag: "StatusChange",
            agentId: "theseus",
            status: "working",
            ts: Date.now(),
          });

          // Append user turn to persistent conversation history
          yield* Ref.update(self._stateRef, (s) => ({
            ...s,
            conversationHistory: trimHistory([
              ...s.conversationHistory,
              { role: "user" as const, content: userMessage },
            ]),
          }));

          const tools: ReadonlyArray<ToolDefinition> = [DELEGATE_TOOL];
          let continueLoop = true;
          let finalContent = "";

          while (continueLoop) {
            continueLoop = yield* Effect.gen(function* () {
              const state = yield* Ref.get(self._stateRef);
              const messages: ReadonlyArray<ChatMessage> = [
                { role: "system", content: THESEUS_SYSTEM_PROMPT },
                ...state.conversationHistory,
              ];

              yield* self.log(`calling LLM (${messages.length} msgs, ${tools.length} tools)…`);

              const response = yield* self._callLLM(messages, tools).pipe(
                Effect.withSpan("llm.chat", {
                  attributes: { agentId: "theseus", messageCount: messages.length },
                }),
              );

              if (response.finishReason === "tool_calls" && response.toolCalls.length > 0) {
                // Append assistant message with tool_calls for API continuity
                yield* Ref.update(self._stateRef, (s) => ({
                  ...s,
                  conversationHistory: trimHistory([
                    ...s.conversationHistory,
                    {
                      role: "assistant" as const,
                      content: response.content ?? "",
                      tool_calls: response.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: "function" as const,
                        function: { name: tc.name, arguments: tc.arguments },
                      })),
                    },
                  ]),
                }));

                // Execute each tool call sequentially
                for (const tc of response.toolCalls) {
                  yield* self.log(`tool → ${tc.name}(${tc.arguments.slice(0, 80)})`);

                  let toolResult: string;

                  if (tc.name === "delegate") {
                    const args = yield* Effect.try({
                      try: () =>
                        JSON.parse(tc.arguments) as { agent_id: string; instruction: string },
                      catch: (e) => new Error(`Failed to parse delegate arguments: ${String(e)}`),
                    }).pipe(
                      Effect.catchCause((cause) =>
                        Effect.succeed({
                          agent_id: "unknown" as string,
                          instruction: `[parse error: ${Cause.pretty(cause)}]` as string,
                        }),
                      ),
                    );

                    toolResult = yield* consultAgent(AgentId(args.agent_id), args.instruction);
                  } else {
                    toolResult = `[Unknown tool: ${tc.name}]`;
                    yield* self.log(`unknown tool call: ${tc.name}`);
                  }

                  // Append tool result to history
                  yield* Ref.update(self._stateRef, (s) => ({
                    ...s,
                    conversationHistory: trimHistory([
                      ...s.conversationHistory,
                      {
                        role: "tool" as const,
                        content: toolResult,
                        tool_call_id: tc.id,
                      },
                    ]),
                  }));
                }

                return true; // loop — call LLM again with tool results in context
              } else if (response.finishReason === "error") {
                yield* self.log(`LLM error: ${response.content}`);
                finalContent = `[Theseus encountered an error and could not complete the request: ${response.content}]`;
                return false;
              } else {
                // finish_reason === "stop" — model finished its turn
                yield* Ref.update(self._stateRef, (s) => ({
                  ...s,
                  conversationHistory: trimHistory([
                    ...s.conversationHistory,
                    { role: "assistant" as const, content: response.content },
                  ]),
                  tasksCompleted: s.tasksCompleted + 1,
                }));
                finalContent = response.content;
                return false;
              }
            });
          }

          yield* push({ _tag: "TheseusResponse", content: finalContent, ts: Date.now() });
          yield* push({ _tag: "StatusChange", agentId: "theseus", status: "idle", ts: Date.now() });
        });

      // ----------------------------------------------------------------
      // Main dispatch loop — blocks on inbox, runs one LLM turn per msg
      // ----------------------------------------------------------------
      while (true) {
        const msg = yield* Queue.take(self._inbox);

        if (msg._tag === "Dispatch") {
          yield* runLLMTurn(msg.instruction);
        } else if (msg._tag === "Steer") {
          yield* runLLMTurn(`[Mid-session guidance from user]: ${msg.guidance}`);
        }
        // Duplicate Start messages after startup are ignored.
      }
    }) as Effect.Effect<never, never, never>;
  }
}
