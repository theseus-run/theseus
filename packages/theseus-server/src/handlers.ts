/**
 * RPC Handlers — server-side implementations for each Theseus RPC procedure.
 *
 * Handlers stay at the transport boundary: they call TheseusRuntime and map
 * runtime errors into RPC errors.
 */

import { RpcError, TheseusRpc } from "@theseus.run/core/Rpc";
import { Effect, Stream } from "effect";
import {
  RuntimeCommands,
  RuntimeControls,
  type RuntimeDispatchFailed,
  type RuntimeNotFound,
  RuntimeQueries,
  type RuntimeToolNotFound,
  TheseusRuntime,
} from "./runtime.ts";
import { serializeEvent } from "./serialize.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toRpcError = (error: RuntimeToolNotFound | RuntimeNotFound | RuntimeDispatchFailed) =>
  new RpcError({
    code:
      error._tag === "RuntimeToolNotFound"
        ? "TOOL_NOT_FOUND"
        : error._tag === "RuntimeNotFound"
          ? "NOT_FOUND"
          : "INTERNAL",
    message:
      error._tag === "RuntimeToolNotFound"
        ? `Unknown tools: ${error.names.join(", ")}`
        : error._tag === "RuntimeNotFound"
          ? `Dispatch ${error.id} not found`
          : `Dispatch error: ${error.reason}`,
  });

// ---------------------------------------------------------------------------
// Handlers Layer
// ---------------------------------------------------------------------------

export const HandlersLive = TheseusRpc.toLayer({
  dispatch: ({ spec: bp, task, continueFrom }) =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      const events = yield* RuntimeCommands.startDispatch(runtime, {
        spec: bp,
        task,
        continueFrom,
      }).pipe(Effect.mapError(toRpcError));
      return events.pipe(Stream.map((event) => serializeEvent(event))) as unknown as never;
    }),

  listDispatches: ({ limit }) =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      return yield* RuntimeQueries.listDispatches(
        runtime,
        limit !== undefined ? { limit } : undefined,
      ).pipe(Effect.mapError(toRpcError));
    }),

  getMessages: ({ dispatchId }) =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      return yield* RuntimeQueries.getMessages(runtime, dispatchId).pipe(
        Effect.mapError(toRpcError),
      );
    }),

  inject: ({ dispatchId, text }) =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      yield* RuntimeControls.inject(runtime, dispatchId, text).pipe(Effect.mapError(toRpcError));
    }),

  interrupt: ({ dispatchId }) =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      yield* RuntimeControls.interrupt(runtime, dispatchId).pipe(Effect.mapError(toRpcError));
    }),

  getResult: ({ dispatchId }) =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      return yield* RuntimeQueries.getResult(runtime, dispatchId).pipe(Effect.mapError(toRpcError));
    }),

  getCapsuleEvents: ({ capsuleId }) =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      return yield* RuntimeQueries.getCapsuleEvents(runtime, capsuleId).pipe(
        Effect.mapError(toRpcError),
      );
    }),

  status: () =>
    Effect.gen(function* () {
      const runtime = yield* TheseusRuntime;
      return yield* RuntimeQueries.status(runtime).pipe(Effect.mapError(toRpcError));
    }),
});
