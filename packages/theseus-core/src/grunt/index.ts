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

import { Effect, Stream } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type { AgentError, AgentResult, Blueprint } from "../agent/index.ts";
import { dispatch, type DispatchEvent } from "../dispatch/index.ts";
import type { ToolCallPolicy } from "../dispatch/policy.ts";

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

export const grunt = (
  blueprint: Blueprint,
  task: string,
): Effect.Effect<GruntHandle, never, LanguageModel.LanguageModel | ToolCallPolicy> =>
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
): Effect.Effect<AgentResult, AgentError, LanguageModel.LanguageModel | ToolCallPolicy> =>
  grunt(blueprint, task).pipe(Effect.flatMap((handle) => handle.result));
