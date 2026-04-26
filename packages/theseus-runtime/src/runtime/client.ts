import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect, Match, type Stream } from "effect";
import type { StatusEntry } from "../registry.ts";
import type { RuntimeError, StartDispatchInput, TheseusRuntimeService } from "./types.ts";

export const RuntimeCommands = {
  startDispatch: (
    runtime: TheseusRuntimeService,
    input: StartDispatchInput,
  ): Effect.Effect<Stream.Stream<Dispatch.DispatchEvent>, RuntimeError> =>
    runtime.submit({ _tag: "DispatchStart", input }).pipe(Effect.map((result) => result.events)),
};

export const RuntimeControls = {
  inject: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
    text: string,
  ): Effect.Effect<void, RuntimeError> =>
    runtime.control({ _tag: "DispatchInject", dispatchId, text }),

  interrupt: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<void, RuntimeError> =>
    runtime.control({ _tag: "DispatchInterrupt", dispatchId }),
};

export const RuntimeQueries = {
  listDispatches: (
    runtime: TheseusRuntimeService,
    options?: { readonly limit?: number },
  ): Effect.Effect<ReadonlyArray<Dispatch.DispatchSummary>, RuntimeError> =>
    runtime
      .query(options === undefined ? { _tag: "DispatchList" } : { _tag: "DispatchList", options })
      .pipe(
        Effect.flatMap((result) =>
          Match.value(result).pipe(
            Match.tag("DispatchList", ({ dispatches }) => Effect.succeed(dispatches)),
            Match.orElse(() => Effect.die("Runtime query returned unexpected result")),
          ),
        ),
      ),

  getMessages: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<
    ReadonlyArray<{ readonly role: string; readonly content: string }>,
    RuntimeError
  > =>
    runtime.query({ _tag: "DispatchMessages", dispatchId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("DispatchMessages", ({ messages }) => Effect.succeed(messages)),
          Match.orElse(() => Effect.die("Runtime query returned unexpected result")),
        ),
      ),
    ),

  getResult: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<Dispatch.DispatchOutput, RuntimeError> =>
    runtime.query({ _tag: "DispatchResult", dispatchId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("DispatchResult", ({ result }) => Effect.succeed(result)),
          Match.orElse(() => Effect.die("Runtime query returned unexpected result")),
        ),
      ),
    ),

  getCapsuleEvents: (
    runtime: TheseusRuntimeService,
    capsuleId: string,
  ): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeError> =>
    runtime.query({ _tag: "CapsuleEvents", capsuleId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("CapsuleEvents", ({ events }) => Effect.succeed(events)),
          Match.orElse(() => Effect.die("Runtime query returned unexpected result")),
        ),
      ),
    ),

  status: (
    runtime: TheseusRuntimeService,
  ): Effect.Effect<ReadonlyArray<StatusEntry>, RuntimeError> =>
    runtime.query({ _tag: "ActiveStatus" }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("ActiveStatus", ({ status }) => Effect.succeed(status)),
          Match.orElse(() => Effect.die("Runtime query returned unexpected result")),
        ),
      ),
    ),
};
