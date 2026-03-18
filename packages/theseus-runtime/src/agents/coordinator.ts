/**
 * CoordinatorAgent — manages a pool of PersistentAgents and routes tasks to them.
 *
 * Messages:
 *   Start    — initialise (spawn forge, enter the dispatch loop)
 *   Dispatch — queue a new coding task; dispatched immediately if forge is idle,
 *              buffered otherwise and sent when forge becomes free
 *   TaskDone — forge finished a task; triggers the next pending task if any
 *
 * Tasks are executed sequentially (one at a time) by a single forge agent.
 * The conversation history accumulates across tasks — forge remembers prior work.
 */
import { Effect, Queue } from "effect"
import { BaseAgent, AgentId } from "../agent.ts"
import type { AgentId as AgentIdType } from "../agent.ts"
import { PersistentAgent } from "./persistent-agent.ts"
import type { CallLLM } from "./persistent-agent.ts"
import { AgentRegistry } from "../registry.ts"

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type CoordinatorMsg =
  | { readonly _tag: "Start" }
  | { readonly _tag: "Dispatch"; readonly instruction: string }
  | { readonly _tag: "TaskDone"; readonly taskId: string; readonly agentId: AgentIdType; readonly historySize: number }

export interface CoordinatorState {
  readonly tasksCompleted: number
}

// ---------------------------------------------------------------------------
// Forge system prompt
// ---------------------------------------------------------------------------

const FORGE_SYSTEM_PROMPT = `You are Forge, a coding agent for the Theseus project.

You have access to tools to read, edit, and navigate the codebase:
- readFile: read any file by path
- listDir: list directory contents
- searchReplace: edit a file by exact text replacement (auto-checks types after write)
- findReferences: semantic TypeScript symbol lookup — find all usages by name
- shell: run shell commands (bun test, git diff, grep, etc.)

Navigation strategy:
- Use shell+grep for distinctive names (class names, unique identifiers) — it is 50-100x faster
- Use findReferences when the symbol name is short or generic (run, id, send, log, execute) and grep would return too much noise
- Use findReferences with kind= and/or definedIn= to disambiguate when a name is shared across many symbols

Editing rules (critical — follow these to avoid retry spirals):
- Always readFile before the first searchReplace on any file
- After a successful searchReplace the tool response includes the updated file content around
  the change — use that as your new snapshot; do NOT call readFile again before the next edit
  to the same file unless a tool error occurred
- After searchReplace, fix any type errors reported before moving on
- If searchReplace returns "search text not found", the full current file is shown in the error —
  find your intended block there and retry with the exact text

Be concise in your final response — summarise the key changes made.`

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class CoordinatorAgent extends BaseAgent<CoordinatorMsg, CoordinatorState> {
  readonly id = AgentId("coordinator")
  readonly initialState: CoordinatorState = { tasksCompleted: 0 }

  private readonly _callLLM: CallLLM

  constructor(callLLM: CallLLM) {
    super()
    this._callLLM = callLLM
  }

  override run(): Effect.Effect<never, never, never> {
    const self = this

    return Effect.gen(function* () {
      yield* Queue.take(self._inbox) // consume Start

      const registry = yield* AgentRegistry
      const forgeName = AgentId("forge-1")
      yield* self.log(`spawning ${forgeName}`)
      yield* registry.spawn(new PersistentAgent(forgeName, self._callLLM, FORGE_SYSTEM_PROMPT))
      yield* self.log(`ready — waiting for Dispatch messages`)

      let taskCounter = 0
      let forgeIdle = true
      const pendingTasks: string[] = []

      // Dispatch the oldest buffered task to forge (if any).
      const dispatchNext = (): Effect.Effect<void> =>
        Effect.gen(function* () {
          const instruction = pendingTasks.shift()
          if (!instruction) return
          taskCounter++
          const taskId = `task-${String(taskCounter).padStart(3, "0")}`
          forgeIdle = false
          yield* self.log(`→ ${taskId}: ${instruction.slice(0, 80)}${instruction.length > 80 ? "…" : ""}`)
          yield* self.send(forgeName, { _tag: "Task", taskId, instruction, replyTo: self.id })
        })

      while (true) {
        const msg = yield* Queue.take(self._inbox)

        if (msg._tag === "Dispatch") {
          pendingTasks.push(msg.instruction)
          if (forgeIdle) {
            yield* dispatchNext()
          } else {
            yield* self.log(`forge busy — task queued (${pendingTasks.length} pending)`)
          }
        } else if (msg._tag === "TaskDone") {
          forgeIdle = true
          yield* self.log(
            `✓ ${msg.taskId} done | history: ${msg.historySize} entries | pending: ${pendingTasks.length}`,
          )
          yield* dispatchNext()
        }
        // "Start" arriving after startup is ignored
      }
    }) as Effect.Effect<never, never, never>
  }
}
