/**
 * Core agent types and BaseAgent abstract class.
 */
import { Brand, Effect } from "effect"
import type { Fiber, Queue, Ref } from "effect"

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type AgentId = string & Brand.Brand<"AgentId">
export const AgentId = Brand.nominal<AgentId>()

// ---------------------------------------------------------------------------
// RuntimeContext — injected into every agent on spawn
// ---------------------------------------------------------------------------

export interface RuntimeContext {
  readonly send: (agentId: AgentId, msg: unknown) => Effect.Effect<void>
  readonly publish: (topic: string, msg: unknown) => Effect.Effect<void>
  readonly log: (content: string) => Effect.Effect<void>
}

// ---------------------------------------------------------------------------
// Lifecycle info (TUI / introspection)
// ---------------------------------------------------------------------------

export type AgentStatus = "running" | "idle" | "stopped"

export interface AgentInfo {
  readonly id: AgentId
  readonly status: AgentStatus
  readonly messagesHandled: number
}

// ---------------------------------------------------------------------------
// BaseAgent
// ---------------------------------------------------------------------------

export abstract class BaseAgent<Msg, State> {
  abstract readonly id: AgentId
  abstract readonly initialState: State

  /**
   * Handle one message, return the next state.
   * Use `this.send / this.publish / this.log` (available after spawn).
   *
   * Used by the default registry loop. Agents that override `run()` may
   * not use this method at all.
   */
  handle(_msg: Msg, state: State): Effect.Effect<State> {
    return Effect.succeed(state)
  }

  /**
   * Optional custom run loop. When defined, the registry uses this instead of
   * the default `Queue.take → handle` loop. The agent is responsible for
   * draining `this._inbox` and updating `this._stateRef` itself.
   *
   * Must never resolve (runs until fiber interrupted).
   */
  run?(): Effect.Effect<never, never, never>

  // -------------------------------------------------------------------------
  // Infrastructure — set by AgentRegistry._initAgent before the fiber forks
  // -------------------------------------------------------------------------

  /** @internal */ _inbox!: Queue.Queue<Msg>
  /** @internal */ _stateRef!: Ref.Ref<State>
  /** @internal */ _fiber: Fiber.Fiber<void, never> | null = null

  protected ctx!: RuntimeContext

  /**
   * Called by AgentRegistry.spawn — wires up the runtime context.
   * @internal
   */
  _initRuntime(ctx: RuntimeContext): void {
    this.ctx = ctx
  }

  // -------------------------------------------------------------------------
  // Helpers available inside handle() / run()
  // -------------------------------------------------------------------------

  protected send<M>(agentId: AgentId, msg: M): Effect.Effect<void> {
    return this.ctx.send(agentId, msg)
  }

  protected publish(topic: string, msg: unknown): Effect.Effect<void> {
    return this.ctx.publish(topic, msg)
  }

  protected log(content: string): Effect.Effect<void> {
    return this.ctx.log(content)
  }
}
