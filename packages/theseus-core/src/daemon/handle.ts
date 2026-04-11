/**
 * DaemonDispatchHandle — client-side proxy mirroring DispatchHandle.
 *
 * Same shape as DispatchHandle so consumer code (CLI, tests) can work
 * with either local or remote dispatches transparently.
 */

import type { Effect, Stream } from "effect";
import type { AgentError, AgentResult } from "../agent/index.ts";
import type { DispatchEvent, Injection } from "../dispatch/types.ts";

export interface DaemonDispatchHandle {
  /** Dispatch identifier. */
  readonly dispatchId: string;
  /** Live event stream — ends with Done event or on connection loss. */
  readonly events: Stream.Stream<DispatchEvent>;
  /** Push an injection into the running dispatch. */
  readonly inject: (injection: Injection) => Effect.Effect<void>;
  /** Interrupt the dispatch (preemptive). */
  readonly interrupt: Effect.Effect<void>;
  /** Await the final AgentResult. */
  readonly result: Effect.Effect<AgentResult, AgentError>;
}
