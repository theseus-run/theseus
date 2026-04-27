/**
 * RPC Handlers — server-side implementations for each Theseus RPC procedure.
 *
 * Handlers stay at the transport boundary: they call TheseusRuntime and map
 * runtime errors into RPC errors.
 */

import type * as Dispatch from "@theseus.run/core/Dispatch";
import {
  type DispatchEventEntrySchema,
  type DispatchSpecSchema,
  RpcError,
  TheseusRpc,
  type WorkControlCommandSchema,
} from "@theseus.run/core/Rpc";
import type {
  RuntimeDispatchFailed,
  RuntimeNotFound,
  RuntimeToolNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
  WorkControlCommand,
} from "@theseus.run/runtime";
import type { SerializedDispatchSpec } from "@theseus.run/runtime/tool-catalog";
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

const optionalString = (value: string | null | undefined): string | undefined =>
  value === null ? undefined : value;

const optionalNumber = (value: number | null | undefined): number | undefined =>
  value === null ? undefined : value;

const isReasoningEffort = (
  value: string | undefined,
): value is NonNullable<
  Extract<Dispatch.ModelRequest, { provider: "openai" }>["reasoningEffort"]
> => value === "low" || value === "medium" || value === "high" || value === "xhigh";

const isTextVerbosity = (
  value: string | undefined,
): value is NonNullable<Extract<Dispatch.ModelRequest, { provider: "openai" }>["textVerbosity"]> =>
  value === "low" || value === "medium" || value === "high";

const normalizeModelRequest = (
  modelRequest: Schema.Schema.Type<typeof DispatchSpecSchema>["modelRequest"],
): Dispatch.ModelRequest | undefined => {
  if (!modelRequest || typeof modelRequest !== "object") return undefined;
  const record = modelRequest as Record<string, unknown>;
  if (record["provider"] === "copilot" && typeof record["model"] === "string") {
    const maxTokens = optionalNumber(record["maxTokens"] as number | null | undefined);
    return {
      provider: "copilot" as const,
      model: record["model"],
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    };
  }
  if (record["provider"] === "openai" && typeof record["model"] === "string") {
    const maxOutputTokens = optionalNumber(record["maxOutputTokens"] as number | null | undefined);
    const reasoningEffort = optionalString(record["reasoningEffort"] as string | null | undefined);
    const textVerbosity = optionalString(record["textVerbosity"] as string | null | undefined);
    return {
      provider: "openai" as const,
      model: record["model"],
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(isReasoningEffort(reasoningEffort) ? { reasoningEffort } : {}),
      ...(isTextVerbosity(textVerbosity) ? { textVerbosity } : {}),
    };
  }
  return undefined;
};

const normalizeDispatchSpec = (spec: {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<{ readonly name: string }>;
  readonly maxIterations?: number | null | undefined;
  readonly modelRequest?: Schema.Schema.Type<typeof DispatchSpecSchema>["modelRequest"];
}): SerializedDispatchSpec => {
  const maxIterations = optionalNumber(spec.maxIterations);
  const modelRequest = normalizeModelRequest(spec.modelRequest);
  return {
    name: spec.name,
    systemPrompt: spec.systemPrompt,
    tools: spec.tools.map((tool) => ({ name: tool.name })),
    ...(maxIterations !== undefined ? { maxIterations } : {}),
    ...(modelRequest !== undefined ? { modelRequest } : {}),
  };
};

const normalizeControlCommand = (
  command: Schema.Schema.Type<typeof WorkControlCommandSchema>,
): WorkControlCommand =>
  Match.value(command).pipe(
    Match.tag("Interrupt", ({ reason }) => ({
      _tag: "Interrupt" as const,
      ...(optionalString(reason) !== undefined ? { reason: optionalString(reason) } : {}),
    })),
    Match.tag("InjectGuidance", ({ text }) => ({ _tag: "InjectGuidance" as const, text })),
    Match.tag("Pause", ({ reason }) => ({
      _tag: "Pause" as const,
      ...(optionalString(reason) !== undefined ? { reason: optionalString(reason) } : {}),
    })),
    Match.tag("Resume", () => ({ _tag: "Resume" as const })),
    Match.tag("RequestStatus", () => ({ _tag: "RequestStatus" as const })),
    Match.exhaustive,
  );

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
      yield* adapter
        .controlWorkNode(workNodeId, normalizeControlCommand(command))
        .pipe(Effect.mapError(toRpcError));
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
      const normalizedSlug = optionalString(slug);
      const input =
        normalizedSlug === undefined
          ? { goal, criteria }
          : { slug: normalizedSlug, goal, criteria };
      return yield* adapter.createMission(input).pipe(Effect.mapError(toRpcError));
    }),

  startMissionDispatch: ({ missionId, spec, task, continueFrom }) =>
    streamRpcHandler(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const normalizedContinueFrom = optionalString(continueFrom);
        const started = yield* adapter
          .startMissionDispatch({
            missionId,
            spec: normalizeDispatchSpec(spec),
            task,
            ...(normalizedContinueFrom !== undefined
              ? { continueFrom: normalizedContinueFrom }
              : {}),
          })
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
      const normalizedLimit = optionalNumber(limit);
      return yield* adapter
        .listRuntimeDispatches(
          normalizedLimit !== undefined ? { limit: normalizedLimit } : undefined,
        )
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
