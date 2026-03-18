/**
 * WorkerAgent — receives tasks, processes them (simulated delay), replies.
 */
import { Effect } from "effect"
import { BaseAgent } from "../agent.ts"
import type { AgentId } from "../agent.ts"

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type WorkerMsg = {
  readonly _tag: "Task"
  readonly taskId: string
  readonly payload: string
  readonly replyTo: AgentId
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface WorkerState {
  readonly tasksHandled: number
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class WorkerAgent extends BaseAgent<WorkerMsg, WorkerState> {
  readonly id: AgentId
  readonly initialState: WorkerState = { tasksHandled: 0 }

  constructor(id: AgentId) {
    super()
    this.id = id
  }

  override handle(msg: WorkerMsg, state: WorkerState): Effect.Effect<WorkerState> {
    const self = this

    return Effect.gen(function* () {
      yield* self.log(`handling ${msg.taskId}: "${msg.payload}"`)

      // Simulate variable-duration async work
      const workMs = 200 + Math.floor(Math.random() * 800)
      yield* Effect.sleep(`${workMs} millis`)

      const result = msg.payload.replace("echo:", "done:").toUpperCase()

      yield* self.send(msg.replyTo, {
        _tag: "WorkerResult",
        workerId: self.id,
        taskId: msg.taskId,
        result,
      })

      return { tasksHandled: state.tasksHandled + 1 }
    })
  }
}
