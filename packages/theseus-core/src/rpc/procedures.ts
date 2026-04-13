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
 *   TheseusRpc.toHandlers({ dispatch: ..., listDispatches: ... })
 *
 *   // Client: call typed methods
 *   client.dispatch({ blueprint, task })
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import {
  BlueprintSchema,
  DispatchEventSchema,
  DispatchSummarySchema,
  MessageSchema,
  AgentResultSchema,
  CapsuleEventSchema,
  UsageSchema,
} from "./schemas.ts";

// ---------------------------------------------------------------------------
// Error schema
// ---------------------------------------------------------------------------

export class RpcError extends Schema.TaggedErrorClass<RpcError>()(
  "RpcError",
  {
    code: Schema.String,
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

/** Start a dispatch — returns a stream of events as the agent works. */
export const Dispatch = Rpc.make("dispatch", {
  stream: true,
  payload: Schema.Struct({
    blueprint: BlueprintSchema,
    task: Schema.String,
    continueFrom: Schema.optional(Schema.String),
  }),
  success: DispatchEventSchema,
  error: RpcError,
});

/** List past dispatches with optional limit. */
export const ListDispatches = Rpc.make("listDispatches", {
  payload: Schema.Struct({
    limit: Schema.optional(Schema.Number),
  }),
  success: Schema.Array(DispatchSummarySchema),
  error: RpcError,
});

/** Get the message history for a completed dispatch. */
export const GetMessages = Rpc.make("getMessages", {
  payload: Schema.Struct({
    dispatchId: Schema.String,
  }),
  success: Schema.Array(MessageSchema),
  error: RpcError,
});

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
  success: AgentResultSchema,
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
  success: Schema.Array(
    Schema.Struct({
      dispatchId: Schema.String,
      agent: Schema.String,
      iteration: Schema.Number,
      state: Schema.Literals(["running", "done", "failed"]),
      usage: UsageSchema,
    }),
  ),
  error: RpcError,
});

// ---------------------------------------------------------------------------
// Group — the full Theseus API surface
// ---------------------------------------------------------------------------

export const TheseusRpc = RpcGroup.make(
  Dispatch,
  ListDispatches,
  GetMessages,
  Inject,
  Interrupt,
  GetResult,
  GetCapsuleEvents,
  Status,
);
