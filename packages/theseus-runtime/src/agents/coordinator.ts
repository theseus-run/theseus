/**
 * CoordinatorAgent — spawns a PersistentAgent and drives the tool-use POC.
 *
 * Scenario:
 *   1. Spawn forge-1 (Forge coding agent with all tools)
 *   2. Dispatch a coding task that requires tool use
 *   3. Wait for completion, log final history size
 */
import { Effect, Queue } from "effect"
import { BaseAgent } from "../agent.ts"
import { AgentId } from "../agent.ts"
import type { AgentId as AgentIdType } from "../agent.ts"
import { PersistentAgent } from "./persistent-agent.ts"
import type { CallLLM } from "./persistent-agent.ts"
import { AgentRegistry } from "../registry.ts"

export type CoordinatorMsg =
  | { readonly _tag: "Start" }
  | { readonly _tag: "TaskDone"; readonly taskId: string; readonly agentId: AgentIdType; readonly historySize: number }

export interface CoordinatorState {
  readonly tasksCompleted: number
}

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
- After searchReplace, fix any type errors reported before moving on
- After every searchReplace on a file, re-read that file before making another edit to it — the file content has changed and your previous snapshot is stale
- Be concise in your final response — show the key changes made`

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

      // Task: self-improvement — make searchReplace return updated file content
      const instruction = [
        "Improve the `searchReplace` tool in `theseus-runtime/src/tools/fs.ts`.",
        "Currently, on a successful edit it returns a message like:",
        "  'Edit applied to <file>. No type errors.'",
        "The problem: when Forge makes multiple edits to the same file, it has to call readFile",
        "again to see the current content. This is wasteful and error-prone.",
        "The fix: after a successful edit, append the full updated file content to the return string.",
        "Format the output as:",
        "  'Edit applied to <rel>. No type errors.\\n\\n--- Updated file content ---\\n<updated>'",
        "(or the type-errors variant with the errors before the file content block).",
        "This way Forge always has the current file state in the tool result and does not need",
        "to call readFile again before the next edit.",
        "Steps: readFile `theseus-runtime/src/tools/fs.ts`, then apply the fix with one searchReplace call.",
      ].join(" ")

      yield* self.log(`→ task-1 (searchReplace returns updated content): ${instruction.slice(0, 80)}…`)
      yield* self.send(forgeName, {
        _tag: "Task",
        taskId: "task-1",
        instruction,
        replyTo: self.id,
      })

      const reply = yield* Queue.take(self._inbox)
      if (reply._tag === "TaskDone") {
        yield* self.log(`task-1 done | history: ${reply.historySize} entries`)
      }

      yield* self.log(`POC complete — tool calling loop verified`)
      yield* Effect.never
    }) as Effect.Effect<never, never, never>
  }
}
