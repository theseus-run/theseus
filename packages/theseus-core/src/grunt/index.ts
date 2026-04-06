/**
 * Grunt — stateless, ephemeral LLM agent. Fire and forget.
 *
 * Thin wrapper over dispatch that strips injection/interrupt.
 * Fresh context per task, no accumulated history.
 * Default choice for getting work done.
 *
 *   grunt()      → GruntHandle (events stream + result)
 *   gruntAwait() → just the result
 */

import { Effect, Stream } from "effect";
import type { AgentError, AgentResult, Blueprint } from "../agent/index.ts";
import { dispatch, type DispatchEvent } from "../dispatch/index.ts";
import type { LLMProvider } from "../llm/provider.ts";

// ---------------------------------------------------------------------------
// GruntHandle — fire-and-forget: observe events, await result
// ---------------------------------------------------------------------------

export interface GruntHandle {
  /** Observable event stream. Completes after Done. */
  readonly events: Stream.Stream<DispatchEvent>;
  /** Await the final result. Fails with AgentError on loop failure. */
  readonly result: Effect.Effect<AgentResult, AgentError>;
}

// ---------------------------------------------------------------------------
// grunt — fire-and-forget dispatch
// ---------------------------------------------------------------------------

export const grunt = (
  blueprint: Blueprint,
  task: string,
): Effect.Effect<GruntHandle, never, LLMProvider> =>
  dispatch(blueprint, task).pipe(
    Effect.map((handle) => ({
      events: handle.events,
      result: handle.result,
    })),
  );

// ---------------------------------------------------------------------------
// gruntAwait — convenience when you only need the result
// ---------------------------------------------------------------------------

export const gruntAwait = (
  blueprint: Blueprint,
  task: string,
): Effect.Effect<AgentResult, AgentError, LLMProvider> =>
  grunt(blueprint, task).pipe(Effect.flatMap((handle) => handle.result));
