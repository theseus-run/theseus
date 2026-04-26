/**
 * RPC Schemas — Effect Schema definitions for the Theseus wire protocol.
 *
 * These schemas define the serialized shapes sent between client and server.
 * They mirror the runtime types in dispatch/types.ts and agent/index.ts
 * but are plain data — no Effect errors, no functions, no Stream handles.
 */

import { Schema } from "effect";
import { DispatchOutputSchema, UsageSchema } from "../dispatch/types.ts";

export { DispatchOutputSchema, UsageSchema } from "../dispatch/types.ts";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const MessageSchema = Schema.Struct({
  role: Schema.String,
  content: Schema.String,
});

// ---------------------------------------------------------------------------
// DispatchSpec (serialized — tool references, not implementations)
// ---------------------------------------------------------------------------

export const SerializedToolRefSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  inputSchema: Schema.optional(Schema.Unknown),
});

export const DispatchSpecSchema = Schema.Struct({
  name: Schema.String,
  systemPrompt: Schema.String,
  tools: Schema.Array(SerializedToolRefSchema),
  maxIterations: Schema.optional(Schema.Number),
  model: Schema.optional(Schema.String),
});

// ---------------------------------------------------------------------------
// ToolCallError (serialized — cause is flattened to plain data)
// ---------------------------------------------------------------------------

export const SerializedToolCallErrorSchema = Schema.Struct({
  _tag: Schema.Literals(["ToolCallUnknown", "ToolCallBadArgs", "ToolCallFailed"]),
  callId: Schema.String,
  name: Schema.String,
  raw: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Unknown),
  cause: Schema.optional(
    Schema.Struct({
      _tag: Schema.optional(Schema.String),
      message: Schema.String,
    }),
  ),
});

// ---------------------------------------------------------------------------
// DispatchEvent (serialized — the union sent over the wire)
// ---------------------------------------------------------------------------

export const DispatchEventSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("Calling"),
    name: Schema.String,
    iteration: Schema.Number,
  }),
  Schema.Struct({
    _tag: Schema.Literal("Text"),
    name: Schema.String,
    iteration: Schema.Number,
    content: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("Thinking"),
    name: Schema.String,
    iteration: Schema.Number,
    content: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("ToolCalling"),
    name: Schema.String,
    iteration: Schema.Number,
    tool: Schema.String,
    args: Schema.Unknown,
  }),
  Schema.Struct({
    _tag: Schema.Literal("ToolResult"),
    name: Schema.String,
    iteration: Schema.Number,
    tool: Schema.String,
    content: Schema.String,
    isError: Schema.Boolean,
  }),
  Schema.Struct({
    _tag: Schema.Literal("ToolError"),
    name: Schema.String,
    iteration: Schema.Number,
    tool: Schema.String,
    error: SerializedToolCallErrorSchema,
  }),
  Schema.Struct({
    _tag: Schema.Literal("SatelliteAction"),
    name: Schema.String,
    iteration: Schema.Number,
    satellite: Schema.String,
    phase: Schema.String,
    action: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("Injected"),
    name: Schema.String,
    iteration: Schema.Number,
    injection: Schema.String,
    detail: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    _tag: Schema.Literal("Done"),
    name: Schema.String,
    result: DispatchOutputSchema,
  }),
  Schema.Struct({
    _tag: Schema.Literal("Failed"),
    name: Schema.String,
    reason: Schema.String,
  }),
]);

// ---------------------------------------------------------------------------
// DispatchSummary (query result for list)
// ---------------------------------------------------------------------------

export const DispatchSummarySchema = Schema.Struct({
  dispatchId: Schema.String,
  name: Schema.String,
  task: Schema.String,
  startedAt: Schema.Number,
  completedAt: Schema.NullOr(Schema.Number),
  status: Schema.Literals(["running", "done", "failed"]),
  usage: UsageSchema,
});

// ---------------------------------------------------------------------------
// CapsuleEvent (serialized)
// ---------------------------------------------------------------------------

export const CapsuleEventSchema = Schema.Struct({
  type: Schema.String,
  at: Schema.String,
  by: Schema.String,
  data: Schema.Unknown,
});
