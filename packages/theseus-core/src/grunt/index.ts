/**
 * Grunt — stateless, ephemeral LLM agent. Fire and forget.
 *
 * Thin wrapper over dispatch that strips injection/interrupt.
 * Fresh context per task, no accumulated history.
 * Default choice for getting work done.
 *
 *   dispatch()      → GruntHandle (events stream + result)
 *   dispatchAwait() → just the result
 *
 * Requires LanguageModel from effect/unstable/ai.
 */

import { Effect, Match, type Stream } from "effect";
import type { AgentError, AgentResult, Blueprint } from "../agent/index.ts";
import {
  AgentCycleExceeded,
  AgentInterrupted,
  AgentLLMError,
  AgentToolFailed,
} from "../agent/index.ts";
import {
  type DispatchError,
  type DispatchEvent,
  type DispatchOptions,
  dispatch as dispatchLoop,
  type LanguageModelGateway,
} from "../dispatch/index.ts";
import type { DispatchStore } from "../dispatch/store.ts";
import type { SatelliteRing } from "../satellite/ring.ts";

// ---------------------------------------------------------------------------
// GruntHandle — fire-and-forget: observe events, await result
// ---------------------------------------------------------------------------

export interface GruntHandle {
  readonly events: Stream.Stream<DispatchEvent>;
  readonly result: Effect.Effect<AgentResult, AgentError>;
}

const toAgentError = (error: DispatchError): AgentError =>
  Match.value(error).pipe(
    Match.tag(
      "DispatchInterrupted",
      (error): AgentError =>
        new AgentInterrupted({
          agent: error.name,
          ...(error.reason !== undefined ? { reason: error.reason } : {}),
        }),
    ),
    Match.tag(
      "DispatchCycleExceeded",
      (error): AgentError =>
        new AgentCycleExceeded({ agent: error.name, max: error.max, usage: error.usage }),
    ),
    Match.tag(
      "DispatchModelFailed",
      (error): AgentError =>
        new AgentLLMError({ agent: error.name, message: error.message, cause: error.cause }),
    ),
    Match.tag(
      "DispatchToolFailed",
      (error): AgentError =>
        new AgentToolFailed({
          agent: error.name,
          tool: error.tool,
          cause: error.error,
        }),
    ),
    Match.exhaustive,
  );

const toAgentResult = (output: {
  readonly content: string;
  readonly usage: AgentResult["usage"];
}): AgentResult => ({
  result: "unstructured",
  summary: "",
  content: output.content,
  usage: output.usage,
});

// ---------------------------------------------------------------------------
// grunt — fire-and-forget dispatch
// ---------------------------------------------------------------------------

export const dispatch = <R = never>(
  blueprint: Blueprint<R>,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<GruntHandle, never, LanguageModelGateway | SatelliteRing | DispatchStore | R> =>
  dispatchLoop(blueprint, task, options).pipe(
    Effect.map((handle) => ({
      events: handle.events,
      result: handle.result.pipe(Effect.map(toAgentResult), Effect.mapError(toAgentError)),
    })),
  );

// ---------------------------------------------------------------------------
// dispatchAwait — convenience when you only need the result
// ---------------------------------------------------------------------------

export const dispatchAwait = <R = never>(
  blueprint: Blueprint<R>,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<
  AgentResult,
  AgentError,
  LanguageModelGateway | SatelliteRing | DispatchStore | R
> => dispatch(blueprint, task, options).pipe(Effect.flatMap((handle) => handle.result));
