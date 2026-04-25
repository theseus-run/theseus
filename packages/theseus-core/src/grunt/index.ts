/**
 * Grunt — stateless, ephemeral LLM agent. Fire and forget.
 *
 * Thin wrapper over dispatch that strips injection/interrupt.
 * Fresh context per task, no accumulated history.
 * Default choice for getting work done.
 *
 *   grunt()      → GruntHandle (events stream + result)
 *   gruntAwait() → just the result
 *
 * Requires LanguageModel from effect/unstable/ai.
 */

import { Effect, type Stream } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type { AgentError, AgentResult, Blueprint } from "../agent/index.ts";
import { type DispatchEvent, type DispatchOptions, dispatch } from "../dispatch/index.ts";
import type { DispatchLog } from "../dispatch/log.ts";
import type { SatelliteRing } from "../satellite/ring.ts";

// ---------------------------------------------------------------------------
// GruntHandle — fire-and-forget: observe events, await result
// ---------------------------------------------------------------------------

export interface GruntHandle {
  readonly events: Stream.Stream<DispatchEvent>;
  readonly result: Effect.Effect<AgentResult, AgentError>;
}

// ---------------------------------------------------------------------------
// grunt — fire-and-forget dispatch
// ---------------------------------------------------------------------------

export const grunt = <R = never>(
  blueprint: Blueprint<R>,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<
  GruntHandle,
  never,
  LanguageModel.LanguageModel | SatelliteRing | DispatchLog | R
> =>
  dispatch(blueprint, task, options).pipe(
    Effect.map((handle) => ({
      events: handle.events,
      result: handle.result,
    })),
  );

// ---------------------------------------------------------------------------
// gruntAwait — convenience when you only need the result
// ---------------------------------------------------------------------------

export const gruntAwait = <R = never>(
  blueprint: Blueprint<R>,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<
  AgentResult,
  AgentError,
  LanguageModel.LanguageModel | SatelliteRing | DispatchLog | R
> => grunt(blueprint, task, options).pipe(Effect.flatMap((handle) => handle.result));
