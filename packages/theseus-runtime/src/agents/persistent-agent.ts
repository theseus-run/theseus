/**
 * PersistentAgent — long-lived agent that accumulates conversationHistory
 * across multiple tasks and checks its inbox for Steer messages between
 * each LLM call / tool-call step.
 *
 * Three properties:
 *   1. Same agent handles multiple sequential tasks without re-spawning.
 *   2. conversationHistory grows across tasks (context persistence).
 *   3. A Steer message injected mid-task is picked up at the next yield point.
 *
 * Tool calling loop (per task):
 *   call LLM →
 *     if finish_reason === "tool_calls": execute tools, append results, repeat
 *     if finish_reason === "stop":       append final response, task done
 */
import { Cause, Deferred, Effect, Queue, Ref } from "effect";
import type { AgentId } from "../agent.ts";
import { BaseAgent } from "../agent.ts";
import type { ChatMessage, ToolDefinition } from "../llm/index.ts";
import type { UIEvent } from "../runtime-bus.ts";
import type { RegisteredTool } from "../tools/index.ts";

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type PersistentMsg =
  | {
      readonly _tag: "Task";
      readonly taskId: string;
      readonly instruction: string;
      /** Complete this Deferred with the final response when the task finishes. */
      readonly reply: Deferred.Deferred<string>;
    }
  | { readonly _tag: "Steer"; readonly guidance: string };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface PersistentState {
  readonly conversationHistory: ReadonlyArray<ChatMessage>;
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
}

// ---------------------------------------------------------------------------
// CallLLM type — injected dependency
// ---------------------------------------------------------------------------

export type CallLLM = (
  messages: ReadonlyArray<ChatMessage>,
  tools: ReadonlyArray<ToolDefinition>,
) => Effect.Effect<
  {
    content: string;
    finishReason: string;
    toolCalls: ReadonlyArray<{ id: string; name: string; arguments: string }>;
    usage: { readonly promptTokens: number; readonly completionTokens: number };
  },
  never
>;

// ---------------------------------------------------------------------------
// Rolling history window — keep the most recent N messages to avoid
// silently overflowing the model's context window on long sessions.
// ---------------------------------------------------------------------------

const MAX_HISTORY = 80;

const trimHistory = <T>(arr: ReadonlyArray<T>): ReadonlyArray<T> =>
  arr.length > MAX_HISTORY ? arr.slice(arr.length - MAX_HISTORY) : arr;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class PersistentAgent extends BaseAgent<PersistentMsg, PersistentState> {
  readonly id: AgentId;
  readonly initialState: PersistentState = {
    conversationHistory: [],
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
  };

  private readonly _callLLM: CallLLM;
  private readonly _systemPrompt: string;
  private readonly _tools: ReadonlyArray<RegisteredTool>;
  private readonly _uiEvents: Queue.Queue<UIEvent>;

  constructor(
    id: AgentId,
    callLLM: CallLLM,
    systemPrompt: string,
    tools: ReadonlyArray<RegisteredTool>,
    uiEvents: Queue.Queue<UIEvent>,
  ) {
    super();
    this.id = id;
    this._callLLM = callLLM;
    this._systemPrompt = systemPrompt;
    this._tools = tools;
    this._uiEvents = uiEvents;
  }

  override run(): Effect.Effect<never, never, never> {
    const self = this;

    const push = (event: UIEvent): Effect.Effect<void> => Queue.offer(self._uiEvents, event);

    return Effect.gen(function* () {
      // Build per-agent tool lookup once — no shared ToolRegistry in env
      const toolHandlers = new Map(self._tools.map((t) => [t.definition.function.name, t.handler]));
      const toolDefs: ReadonlyArray<ToolDefinition> = self._tools.map((t) => t.definition);

      yield* self.log(
        `ready | history: ${(yield* Ref.get(self._stateRef)).conversationHistory.length} entries`,
      );

      while (true) {
        // Block until a Task arrives
        const msg = yield* Queue.take(self._inbox);
        if (msg._tag !== "Task") {
          yield* self.log(
            `steer outside task (discarded): "${(msg as Extract<PersistentMsg, { _tag: "Steer" }>).guidance}"`,
          );
          continue;
        }

        const { taskId, instruction, reply } = msg;
        yield* self.log(`${taskId} | starting`);

        // Append the user turn
        yield* Ref.update(self._stateRef, (s) => ({
          ...s,
          conversationHistory: trimHistory([
            ...s.conversationHistory,
            { role: "user" as const, content: instruction },
          ]),
        }));

        // Tool calling loop — continues while model calls tools
        let continueLoop = true;
        let finalResponse = "";
        while (continueLoop) {
          continueLoop = yield* Effect.gen(function* () {
            const state = yield* Ref.get(self._stateRef);
            const messages: ReadonlyArray<ChatMessage> = [
              { role: "system", content: self._systemPrompt },
              ...state.conversationHistory,
            ];

            yield* self.log(
              `${taskId} | calling LLM (${messages.length} msgs, ${toolDefs.length} tools)…`,
            );

            const response = yield* self._callLLM(messages, toolDefs).pipe(
              Effect.withSpan("llm.chat", {
                attributes: { taskId, agentId: self.id, messageCount: messages.length },
              }),
            );

            // Accumulate token usage
            yield* Ref.update(self._stateRef, (s) => ({
              ...s,
              totalPromptTokens: s.totalPromptTokens + (response.usage?.promptTokens ?? 0),
              totalCompletionTokens:
                s.totalCompletionTokens + (response.usage?.completionTokens ?? 0),
            }));
            const usageState = yield* Ref.get(self._stateRef);
            yield* self.log(
              `${taskId} | tokens: +${response.usage?.promptTokens ?? 0}p +${response.usage?.completionTokens ?? 0}c (total: ${usageState.totalPromptTokens}p ${usageState.totalCompletionTokens}c)`,
            );

            // --- yield point A: after LLM response, before tool execution ---
            const steerA = yield* Queue.poll(self._inbox);
            if (steerA._tag === "Some" && steerA.value._tag === "Steer") {
              const guidance = steerA.value.guidance;
              yield* self.log(`${taskId} | steer (after llm): "${guidance}"`);
              yield* Ref.update(self._stateRef, (s) => ({
                ...s,
                conversationHistory: trimHistory([
                  ...s.conversationHistory,
                  { role: "user" as const, content: `[Guidance from operator: ${guidance}]` },
                ]),
              }));
            }

            if (response.finishReason === "tool_calls" && response.toolCalls.length > 0) {
              // Append the assistant message with tool_calls (needed for API continuity)
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

              // Execute each tool call and append results
              for (const tc of response.toolCalls) {
                yield* self.log(`${taskId} | tool → ${tc.name}(${tc.arguments.slice(0, 80)})`);
                yield* push({
                  _tag: "ToolCall",
                  taskId,
                  tool: tc.name,
                  args: tc.arguments.slice(0, 120),
                  ts: Date.now(),
                });

                const parsedArgs = yield* Effect.try({
                  try: () => JSON.parse(tc.arguments) as unknown,
                  catch: (e) =>
                    new Error(`Failed to parse tool arguments for ${tc.name}: ${String(e)}`),
                }).pipe(
                  Effect.catchCause((cause) => {
                    // Log the parse failure and pass empty object so the tool handler can report the issue
                    return Effect.as(
                      Effect.logError(`tool arg parse failed: ${Cause.pretty(cause)}`),
                      {} as unknown,
                    );
                  }),
                );

                const handler = toolHandlers.get(tc.name);
                const result = yield* (
                  handler ? handler(parsedArgs) : Effect.succeed(`Error: unknown tool "${tc.name}"`)
                ).pipe(
                  Effect.catchCause((cause) =>
                    Effect.succeed(`Tool error: ${Cause.pretty(cause)}`),
                  ),
                  Effect.withSpan("tool.execute", {
                    attributes: { toolName: tc.name, taskId, agentId: self.id },
                  }),
                );
                yield* self.log(
                  `${taskId} | tool ← ${tc.name}: ${result.slice(0, 100)}${result.length > 100 ? "…" : ""}`,
                );
                yield* push({
                  _tag: "ToolResult",
                  taskId,
                  tool: tc.name,
                  preview: result.slice(0, 120),
                  ok: true,
                  ts: Date.now(),
                });

                yield* Ref.update(self._stateRef, (s) => ({
                  ...s,
                  conversationHistory: trimHistory([
                    ...s.conversationHistory,
                    {
                      role: "tool" as const,
                      content: result,
                      tool_call_id: tc.id,
                    },
                  ]),
                }));
              }

              // --- yield point B: after tool results injected ---
              const steerB = yield* Queue.poll(self._inbox);
              if (steerB._tag === "Some" && steerB.value._tag === "Steer") {
                const guidance = steerB.value.guidance;
                yield* self.log(`${taskId} | steer (after tools): "${guidance}"`);
                yield* Ref.update(self._stateRef, (s) => ({
                  ...s,
                  conversationHistory: trimHistory([
                    ...s.conversationHistory,
                    { role: "user" as const, content: `[Guidance from operator: ${guidance}]` },
                  ]),
                }));
              }

              // Loop continues — call LLM again with tool results in context
              return true;
            } else if (response.finishReason === "error") {
              // LLM call failed (timeout, network error, etc.).
              // Log the error but do NOT append to conversationHistory — a raw error
              // string as an assistant message would confuse subsequent LLM calls.
              yield* self.log(`${taskId} | LLM error (history unchanged): ${response.content}`);
              return false;
            } else {
              // finish_reason === "stop" — model is done
              yield* Ref.update(self._stateRef, (s) => ({
                ...s,
                conversationHistory: trimHistory([
                  ...s.conversationHistory,
                  { role: "assistant" as const, content: response.content },
                ]),
              }));

              finalResponse = response.content;
              yield* self.log(`${taskId} | done (${response.content.length} chars)`);
              return false;
            }
          });
        }

        const stateAfter = yield* Ref.get(self._stateRef);
        yield* self.log(
          `${taskId} | done (${finalResponse.length} chars, history: ${stateAfter.conversationHistory.length})`,
        );
        yield* Deferred.succeed(reply, finalResponse);
      }
    }) as Effect.Effect<never, never, never>;
  }
}
