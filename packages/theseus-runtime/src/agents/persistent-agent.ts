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
import { Effect, Queue, Ref } from "effect"
import { BaseAgent } from "../agent.ts"
import type { AgentId } from "../agent.ts"
import type { ChatMessage, ToolDefinition } from "../llm/index.ts"
import { ToolRegistry } from "../tools/index.ts"

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type PersistentMsg =
  | { readonly _tag: "Task"; readonly taskId: string; readonly instruction: string; readonly replyTo: AgentId }
  | { readonly _tag: "Steer"; readonly guidance: string }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type HistoryMessage = ChatMessage

export interface PersistentState {
  readonly conversationHistory: ReadonlyArray<HistoryMessage>
}

// ---------------------------------------------------------------------------
// CallLLM type — injected dependency
// ---------------------------------------------------------------------------

export type CallLLM = (
  messages: ReadonlyArray<ChatMessage>,
  tools: ReadonlyArray<ToolDefinition>,
) => Effect.Effect<{
  content: string
  finishReason: string
  toolCalls: ReadonlyArray<{ id: string; name: string; arguments: string }>
}, never>

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class PersistentAgent extends BaseAgent<PersistentMsg, PersistentState> {
  readonly id: AgentId
  readonly initialState: PersistentState = { conversationHistory: [] }

  private readonly _callLLM: CallLLM
  private readonly _systemPrompt: string

  constructor(id: AgentId, callLLM: CallLLM, systemPrompt: string) {
    super()
    this.id = id
    this._callLLM = callLLM
    this._systemPrompt = systemPrompt
  }

  override run(): Effect.Effect<never, never, never> {
    const self = this
    return Effect.gen(function* () {
      const toolRegistry = yield* ToolRegistry
      yield* self.log(`ready | history: ${(yield* Ref.get(self._stateRef)).conversationHistory.length} entries`)

      while (true) {
        // Block until a Task arrives
        const msg = yield* Queue.take(self._inbox)
        if (msg._tag !== "Task") {
          yield* self.log(`steer outside task (discarded): "${(msg as Extract<PersistentMsg, { _tag: "Steer" }>).guidance}"`)
          continue
        }

        const { taskId, instruction, replyTo } = msg
        yield* self.log(`${taskId} | starting`)

        // Append the user turn
        yield* Ref.update(self._stateRef, (s) => ({
          conversationHistory: [
            ...s.conversationHistory,
            { role: "user" as const, content: instruction },
          ],
        }))

        const tools = toolRegistry.definitions()

        // Tool calling loop — repeats until the model stops calling tools
        let continueLoop = true
        while (continueLoop) {
          const state = yield* Ref.get(self._stateRef)
          const messages: ReadonlyArray<ChatMessage> = [
            { role: "system", content: self._systemPrompt },
            ...state.conversationHistory,
          ]

          yield* self.log(`${taskId} | calling LLM (${messages.length} msgs, ${tools.length} tools)…`)

          const response = yield* self._callLLM(messages, tools)

          // --- yield point A: after LLM response, before tool execution ---
          const steerA = yield* Queue.poll(self._inbox)
          if (steerA._tag === "Some" && steerA.value._tag === "Steer") {
            yield* self.log(`${taskId} | steer (after llm): "${steerA.value.guidance}"`)
          }

          if (response.finishReason === "tool_calls" && response.toolCalls.length > 0) {
            // Append the assistant message with tool_calls (needed for API continuity)
            yield* Ref.update(self._stateRef, (s) => ({
              conversationHistory: [
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
              ],
            }))

            // Execute each tool call and append results
            for (const tc of response.toolCalls) {
              yield* self.log(`${taskId} | tool → ${tc.name}(${tc.arguments.slice(0, 80)})`)

              let parsedArgs: unknown
              try {
                parsedArgs = JSON.parse(tc.arguments)
              } catch {
                parsedArgs = {}
              }

              const result = yield* toolRegistry.execute(tc.name, parsedArgs)
              yield* self.log(`${taskId} | tool ← ${tc.name}: ${result.slice(0, 100)}${result.length > 100 ? "…" : ""}`)

              yield* Ref.update(self._stateRef, (s) => ({
                conversationHistory: [
                  ...s.conversationHistory,
                  {
                    role: "tool" as const,
                    content: result,
                    tool_call_id: tc.id,
                  },
                ],
              }))
            }

            // --- yield point B: after tool results injected ---
            const steerB = yield* Queue.poll(self._inbox)
            if (steerB._tag === "Some" && steerB.value._tag === "Steer") {
              yield* self.log(`${taskId} | steer (after tools): "${steerB.value.guidance}"`)
            }

            // Loop continues — call LLM again with tool results in context
          } else {
            // finish_reason === "stop" — model is done
            yield* Ref.update(self._stateRef, (s) => ({
              conversationHistory: [
                ...s.conversationHistory,
                { role: "assistant" as const, content: response.content },
              ],
            }))

            const preview = response.content.slice(0, 120)
            yield* self.log(`${taskId} | done: ${preview}${response.content.length > 120 ? "…" : ""}`)
            continueLoop = false
          }
        }

        const stateAfter = yield* Ref.get(self._stateRef)
        yield* self.send(replyTo, {
          _tag: "TaskDone",
          taskId,
          agentId: self.id,
          historySize: stateAfter.conversationHistory.length,
        })
      }
    }) as Effect.Effect<never, never, never>
  }
}
