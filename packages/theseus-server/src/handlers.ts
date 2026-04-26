/**
 * RPC Handlers — server-side implementations for each Theseus RPC procedure.
 *
 * Handlers stay at the transport boundary: they call TheseusRuntime and map
 * runtime errors into RPC errors.
 */

import { RpcError, TheseusRpc } from "@theseus.run/core/Rpc";
import type {
  RuntimeDispatchEvent,
  RuntimeDispatchFailed,
  RuntimeNotFound,
  RuntimeToolNotFound,
} from "@theseus.run/runtime";
import { Effect, Match, Stream } from "effect";
import { RuntimeRpcAdapter } from "./runtime-rpc-adapter.ts";
import { serializeEvent, serializeRuntimeEvent } from "./serialize.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toRpcError = (error: RuntimeToolNotFound | RuntimeNotFound | RuntimeDispatchFailed) =>
  Match.value(error).pipe(
    Match.tag(
      "RuntimeToolNotFound",
      ({ names }) =>
        new RpcError({ code: "TOOL_NOT_FOUND", message: `Unknown tools: ${names.join(", ")}` }),
    ),
    Match.tag(
      "RuntimeNotFound",
      ({ id, kind }) => new RpcError({ code: "NOT_FOUND", message: `${kind} ${id} not found` }),
    ),
    Match.tag(
      "RuntimeDispatchFailed",
      ({ reason }) => new RpcError({ code: "INTERNAL", message: `Dispatch error: ${reason}` }),
    ),
    Match.exhaustive,
  );

const isWrappedDispatchEvent = (
  event: RuntimeDispatchEvent,
): event is Extract<RuntimeDispatchEvent, { readonly _tag: "DispatchEvent" }> =>
  event._tag === "DispatchEvent";

const startInput = <Input extends { readonly continueFrom?: string | undefined }>(
  input: Input,
): Omit<Input, "continueFrom"> | Input => {
  const { continueFrom, ...rest } = input;
  return continueFrom === undefined ? rest : input;
};

// ---------------------------------------------------------------------------
// Handlers Layer
// ---------------------------------------------------------------------------

export const HandlersLive = TheseusRpc.toLayer({
  dispatch: ({ spec: bp, task, continueFrom }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const mission = yield* adapter
          .createMission({
            slug: bp.name,
            goal: task,
            criteria: [],
          })
          .pipe(Effect.mapError(toRpcError));
        const started = yield* adapter
          .startMissionDispatch(
            startInput({
              missionId: mission.missionId,
              spec: bp,
              task,
              continueFrom,
            }),
          )
          .pipe(Effect.mapError(toRpcError));
        return started.events.pipe(
          Stream.filter(isWrappedDispatchEvent),
          Stream.map((event) => serializeEvent(event.event)),
        );
      }),
    ) as never,

  listDispatches: ({ limit }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      const sessions = yield* adapter
        .listRuntimeDispatches(limit !== undefined ? { limit } : undefined)
        .pipe(Effect.mapError(toRpcError));
      return sessions.map((session) => ({
        dispatchId: session.dispatchId,
        name: session.name,
        task: "",
        startedAt: 0,
        completedAt: session.state === "running" ? null : 0,
        status: session.state,
        usage: session.usage,
      }));
    }),

  getMessages: ({ dispatchId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.getMessages(dispatchId).pipe(Effect.mapError(toRpcError));
    }),

  inject: ({ dispatchId, text }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      yield* adapter.inject(dispatchId, text).pipe(Effect.mapError(toRpcError));
    }),

  interrupt: ({ dispatchId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      yield* adapter.interrupt(dispatchId).pipe(Effect.mapError(toRpcError));
    }),

  getResult: ({ dispatchId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.getResult(dispatchId).pipe(Effect.mapError(toRpcError));
    }),

  getCapsuleEvents: ({ capsuleId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.getCapsuleEvents(capsuleId).pipe(Effect.mapError(toRpcError));
    }),

  status: () =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.status().pipe(Effect.mapError(toRpcError));
    }),

  createMission: ({ slug, goal, criteria }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      const input = slug === undefined ? { goal, criteria } : { slug, goal, criteria };
      return yield* adapter.createMission(input).pipe(Effect.mapError(toRpcError));
    }),

  startMissionDispatch: ({ missionId, spec, task, continueFrom }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const started = yield* adapter
          .startMissionDispatch(startInput({ missionId, spec, task, continueFrom }))
          .pipe(Effect.mapError(toRpcError));
        return started.events.pipe(Stream.map(serializeRuntimeEvent));
      }),
    ) as never,

  listMissions: () =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.listMissions().pipe(Effect.mapError(toRpcError));
    }),

  getMission: ({ missionId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.getMission(missionId).pipe(Effect.mapError(toRpcError));
    }),

  listRuntimeDispatches: ({ limit }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter
        .listRuntimeDispatches(limit !== undefined ? { limit } : undefined)
        .pipe(Effect.mapError(toRpcError));
    }),

  getDispatchCapsuleEvents: ({ dispatchId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.getDispatchCapsuleEvents(dispatchId).pipe(Effect.mapError(toRpcError));
    }),
});
