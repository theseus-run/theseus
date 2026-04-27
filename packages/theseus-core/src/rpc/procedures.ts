/**
 * RPC Procedures — typed definitions for the Theseus client-server protocol.
 *
 * Each procedure is a typed Rpc with payload/success schemas.
 * Streaming procedures use `stream: true` for real-time event delivery.
 *
 * Usage:
 *   import { TheseusRpc } from "@theseus.run/core/Rpc"
 *
 *   // Server: implement handlers
 *   TheseusRpc.toHandlers({ createMission: ..., startMissionDispatch: ... })
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import {
  CapsuleEventSchema,
  DispatchOutputSchema,
  DispatchSessionSchema,
  DispatchSpecSchema,
  MissionSessionSchema,
  ResearchPocEventSchema,
  RuntimeDispatchEventSchema,
  WorkNodeSessionSchema,
} from "./schemas.ts";

// ---------------------------------------------------------------------------
// Error schema
// ---------------------------------------------------------------------------

export class RpcError extends Schema.TaggedErrorClass<RpcError>()("RpcError", {
  code: Schema.String,
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

/** Inject a user message into a running dispatch. */
export const Inject = Rpc.make("inject", {
  payload: Schema.Struct({
    dispatchId: Schema.String,
    text: Schema.String,
  }),
  success: Schema.Void,
  error: RpcError,
});

/** Interrupt a running dispatch. */
export const Interrupt = Rpc.make("interrupt", {
  payload: Schema.Struct({
    dispatchId: Schema.String,
  }),
  success: Schema.Void,
  error: RpcError,
});

/** Get the result of a completed dispatch. */
export const GetResult = Rpc.make("getResult", {
  payload: Schema.Struct({
    dispatchId: Schema.String,
  }),
  success: DispatchOutputSchema,
  error: RpcError,
});

/** Get capsule events for a capsule ID. */
export const GetCapsuleEvents = Rpc.make("getCapsuleEvents", {
  payload: Schema.Struct({
    capsuleId: Schema.String,
  }),
  success: Schema.Array(CapsuleEventSchema),
  error: RpcError,
});

/** Get active dispatch status. */
export const Status = Rpc.make("status", {
  payload: Schema.Void,
  success: Schema.Array(DispatchSessionSchema),
  error: RpcError,
});

/** Create a runtime mission session. */
export const CreateMission = Rpc.make("createMission", {
  payload: Schema.Struct({
    slug: Schema.optional(Schema.String),
    goal: Schema.String,
    criteria: Schema.Array(Schema.String),
  }),
  success: MissionSessionSchema,
  error: RpcError,
});

/** Start a coordinator dispatch inside an existing mission. */
export const StartMissionDispatch = Rpc.make("startMissionDispatch", {
  stream: true,
  payload: Schema.Struct({
    missionId: Schema.String,
    spec: DispatchSpecSchema,
    task: Schema.String,
    continueFrom: Schema.optional(Schema.String),
  }),
  success: RuntimeDispatchEventSchema,
  error: RpcError,
});

/** List runtime mission sessions. */
export const ListMissions = Rpc.make("listMissions", {
  payload: Schema.Void,
  success: Schema.Array(MissionSessionSchema),
  error: RpcError,
});

/** Get one runtime mission session. */
export const GetMission = Rpc.make("getMission", {
  payload: Schema.Struct({
    missionId: Schema.String,
  }),
  success: MissionSessionSchema,
  error: RpcError,
});

/** List runtime dispatch sessions. */
export const ListRuntimeDispatches = Rpc.make("listRuntimeDispatches", {
  payload: Schema.Struct({
    limit: Schema.optional(Schema.Number),
  }),
  success: Schema.Array(DispatchSessionSchema),
  error: RpcError,
});

/** Read the mission-scoped runtime work tree. */
export const GetMissionWorkTree = Rpc.make("getMissionWorkTree", {
  payload: Schema.Struct({
    missionId: Schema.String,
  }),
  success: Schema.Array(WorkNodeSessionSchema),
  error: RpcError,
});

/** Get capsule events by dispatch identity. */
export const GetDispatchCapsuleEvents = Rpc.make("getDispatchCapsuleEvents", {
  payload: Schema.Struct({
    dispatchId: Schema.String,
  }),
  success: Schema.Array(CapsuleEventSchema),
  error: RpcError,
});

/** Server-owned nested research POC: mission -> coordinator -> research grunt. */
export const StartResearchPoc = Rpc.make("startResearchPoc", {
  stream: true,
  payload: Schema.Struct({
    goal: Schema.String,
  }),
  success: ResearchPocEventSchema,
  error: RpcError,
});

// ---------------------------------------------------------------------------
// Group — the full Theseus API surface
// ---------------------------------------------------------------------------

export const TheseusRpc = RpcGroup.make(
  Inject,
  Interrupt,
  GetResult,
  GetCapsuleEvents,
  Status,
  CreateMission,
  StartMissionDispatch,
  ListMissions,
  GetMission,
  ListRuntimeDispatches,
  GetMissionWorkTree,
  GetDispatchCapsuleEvents,
  StartResearchPoc,
);
