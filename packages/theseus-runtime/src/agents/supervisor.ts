/**
 * SupervisorAgent — generates tasks on a ticker and dispatches them to workers.
 */
import { Effect, Queue } from "effect"
import { BaseAgent } from "../agent.ts"
import type { AgentId } from "../agent.ts"

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type SupervisorMsg =
  | { readonly _tag: "Tick" }
  | {
      readonly _tag: "WorkerResult"
      readonly workerId: AgentId
      readonly taskId: string
      readonly result: string
    }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SupervisorState {
  readonly taskCounter: number
  readonly completedTasks: number
  readonly workerIds: ReadonlyArray<AgentId>
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class SupervisorAgent extends BaseAgent<SupervisorMsg, SupervisorState> {
  readonly id = "supervisor"

  constructor(private readonly workerIds: ReadonlyArray<AgentId>) {
    super()
  }

  get initialState(): SupervisorState {
    return { taskCounter: 0, completedTasks: 0, workerIds: this.workerIds }
  }

  override handle(
    msg: SupervisorMsg,
    state: SupervisorState,
  ): Effect.Effect<SupervisorState> {
    const self = this

    switch (msg._tag) {
      case "Tick": {
        const taskId = `task-${String(state.taskCounter + 1).padStart(3, "0")}`
        const workerIdx = state.taskCounter % state.workerIds.length
        const targetWorker = state.workerIds[workerIdx]
        if (!targetWorker) return Effect.succeed(state)

        return Effect.gen(function* () {
          yield* self.send(targetWorker, {
            _tag: "Task",
            taskId,
            payload: `echo:${taskId}`,
            replyTo: self.id,
          })
          yield* self.log(
            `dispatched ${taskId} → ${targetWorker}  (done so far: ${state.completedTasks})`,
          )
          return { ...state, taskCounter: state.taskCounter + 1 }
        })
      }

      case "WorkerResult": {
        return Effect.gen(function* () {
          yield* self.log(
            `✓ ${msg.taskId} from ${msg.workerId}: "${msg.result}"`,
          )
          return { ...state, completedTasks: state.completedTasks + 1 }
        })
      }
    }
  }

  /** Start a ticker fiber that sends Tick to self every intervalMs. */
  startTicker(intervalMs = 1500): Effect.Effect<void> {
    const inbox = this._inbox
    return Effect.forkDetach(
      Effect.gen(function* () {
        while (true) {
          yield* Effect.sleep(`${intervalMs} millis`)
          yield* Queue.offer(inbox, { _tag: "Tick" })
        }
      }),
    )
  }
}
