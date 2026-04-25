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

import { Effect, type Stream } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
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
} from "../dispatch/index.ts";
import type { DispatchLog } from "../dispatch/log.ts";
import type { DispatchStore } from "../dispatch/store.ts";
import type { SatelliteRing } from "../satellite/ring.ts";

// ---------------------------------------------------------------------------
// GruntHandle — fire-and-forget: observe events, await result
// ---------------------------------------------------------------------------

export interface GruntHandle {
  readonly events: Stream.Stream<DispatchEvent>;
  readonly result: Effect.Effect<AgentResult, AgentError>;
}

const toAgentError = (error: DispatchError): AgentError => {
  switch (error._tag) {
    case "DispatchInterrupted":
      return new AgentInterrupted({
        agent: error.name,
        ...(error.reason !== undefined ? { reason: error.reason } : {}),
      });
    case "DispatchCycleExceeded":
      return new AgentCycleExceeded({ agent: error.name, max: error.max, usage: error.usage });
    case "DispatchModelFailed":
      return new AgentLLMError({ agent: error.name, message: error.message, cause: error.cause });
    case "DispatchToolFailed":
      return new AgentToolFailed({
        agent: error.name,
        tool: error.tool,
        cause: error.error,
      });
  }
};

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
): Effect.Effect<
  GruntHandle,
  never,
  LanguageModel.LanguageModel | SatelliteRing | DispatchLog | DispatchStore | R
> =>
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
  LanguageModel.LanguageModel | SatelliteRing | DispatchLog | DispatchStore | R
> => dispatch(blueprint, task, options).pipe(Effect.flatMap((handle) => handle.result));
