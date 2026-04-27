/**
 * RPC Handlers — server-side implementations for each Theseus RPC procedure.
 *
 * Handlers stay at the transport boundary: they call TheseusRuntime and map
 * runtime errors into RPC errors.
 */

import { type DispatchEventEntrySchema, RpcError, TheseusRpc } from "@theseus.run/core/Rpc";
import type {
  RuntimeDispatchFailed,
  RuntimeNotFound,
  RuntimeToolNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
} from "@theseus.run/runtime";
import type { Schema } from "effect";
import { Effect, Match, Stream } from "effect";
import type { ResearchPocEvent } from "./runtime-rpc-adapter.ts";
import { RuntimeRpcAdapter } from "./runtime-rpc-adapter.ts";
import { serializeEvent, serializeRuntimeEvent } from "./serialize.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toRpcError = (
  error:
    | RuntimeToolNotFound
    | RuntimeNotFound
    | RuntimeDispatchFailed
    | RuntimeWorkControlUnsupported
    | RuntimeWorkControlFailed,
) =>
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
    Match.tag(
      "RuntimeWorkControlUnsupported",
      ({ reason }) => new RpcError({ code: "CONTROL_UNSUPPORTED", message: reason }),
    ),
    Match.tag(
      "RuntimeWorkControlFailed",
      ({ reason }) => new RpcError({ code: "CONTROL_FAILED", message: reason }),
    ),
    Match.exhaustive,
  );

const startInput = <Input extends { readonly continueFrom?: string | undefined }>(
  input: Input,
): Omit<Input, "continueFrom"> | Input => {
  const { continueFrom, ...rest } = input;
  return continueFrom === undefined ? rest : input;
};

const streamRpcHandler = <A, E, R>(effect: Effect.Effect<Stream.Stream<A>, E, R>) =>
  // Effect RPC streaming handlers must return a Stream directly. Returning an
  // Effect that produces a Stream is treated as a unary result and defects at
  // runtime, so the effectful setup is lifted with Stream.unwrap at the
  // transport boundary.
  Stream.unwrap(effect) as never;

const serializeResearchPocEvent = (event: ResearchPocEvent): unknown =>
  event._tag === "MissionCreated" ? event : serializeRuntimeEvent(event);

type DispatchEventEntryWire = Schema.Schema.Type<typeof DispatchEventEntrySchema>;

// ---------------------------------------------------------------------------
// Handlers Layer
// ---------------------------------------------------------------------------

export const HandlersLive = TheseusRpc.toLayer({
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

  controlWorkNode: ({ workNodeId, command }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      yield* adapter.controlWorkNode(workNodeId, command).pipe(Effect.mapError(toRpcError));
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
    streamRpcHandler(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const started = yield* adapter
          .startMissionDispatch(startInput({ missionId, spec, task, continueFrom }))
          .pipe(Effect.mapError(toRpcError));
        return started.events.pipe(Stream.map(serializeRuntimeEvent));
      }),
    ),

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

  getMissionWorkTree: ({ missionId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.getMissionWorkTree(missionId).pipe(Effect.mapError(toRpcError));
    }),

  getDispatchCapsuleEvents: ({ dispatchId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      return yield* adapter.getDispatchCapsuleEvents(dispatchId).pipe(Effect.mapError(toRpcError));
    }),

  getDispatchEvents: ({ dispatchId }) =>
    Effect.gen(function* () {
      const adapter = yield* RuntimeRpcAdapter;
      const events = yield* adapter.getDispatchEvents(dispatchId).pipe(Effect.mapError(toRpcError));
      return events.map(
        (entry): DispatchEventEntryWire => ({
          ...entry,
          event: serializeEvent(entry.event) as DispatchEventEntryWire["event"],
        }),
      );
    }),

  startResearchPoc: ({ goal }) =>
    streamRpcHandler(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const events = yield* adapter.startResearchPoc(goal).pipe(Effect.mapError(toRpcError));
        return events.pipe(Stream.map(serializeResearchPocEvent));
      }),
    ),
});
