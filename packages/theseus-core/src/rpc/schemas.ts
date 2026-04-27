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
  modelRequest: Schema.optional(
    Schema.Union([
      Schema.Struct({
        provider: Schema.Literal("openai"),
        model: Schema.String,
        maxOutputTokens: Schema.optional(Schema.Number),
        reasoningEffort: Schema.optional(Schema.Literals(["low", "medium", "high", "xhigh"])),
        textVerbosity: Schema.optional(Schema.Literals(["low", "medium", "high"])),
      }),
      Schema.Struct({
        provider: Schema.Literal("copilot"),
        model: Schema.String,
        maxTokens: Schema.optional(Schema.Number),
      }),
    ]),
  ),
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
  Schema.TaggedStruct("Calling", {
    name: Schema.String,
    iteration: Schema.Number,
  }),
  Schema.TaggedStruct("Text", {
    name: Schema.String,
    iteration: Schema.Number,
    content: Schema.String,
  }),
  Schema.TaggedStruct("Thinking", {
    name: Schema.String,
    iteration: Schema.Number,
    content: Schema.String,
  }),
  Schema.TaggedStruct("ToolCalling", {
    name: Schema.String,
    iteration: Schema.Number,
    tool: Schema.String,
    args: Schema.Unknown,
  }),
  Schema.TaggedStruct("ToolResult", {
    name: Schema.String,
    iteration: Schema.Number,
    tool: Schema.String,
    content: Schema.String,
    isError: Schema.Boolean,
    structured: Schema.optional(Schema.Unknown),
  }),
  Schema.TaggedStruct("ToolError", {
    name: Schema.String,
    iteration: Schema.Number,
    tool: Schema.String,
    error: SerializedToolCallErrorSchema,
  }),
  Schema.TaggedStruct("SatelliteAction", {
    name: Schema.String,
    iteration: Schema.Number,
    satellite: Schema.String,
    phase: Schema.String,
    action: Schema.String,
  }),
  Schema.TaggedStruct("Injected", {
    name: Schema.String,
    iteration: Schema.Number,
    injection: Schema.String,
    detail: Schema.optional(Schema.String),
  }),
  Schema.TaggedStruct("Done", {
    name: Schema.String,
    result: DispatchOutputSchema,
  }),
  Schema.TaggedStruct("Failed", {
    name: Schema.String,
    reason: Schema.String,
  }),
]);

// ---------------------------------------------------------------------------
// Runtime mission / dispatch sessions
// ---------------------------------------------------------------------------

export const MissionSessionSchema = Schema.Struct({
  missionId: Schema.String,
  capsuleId: Schema.String,
  goal: Schema.String,
  criteria: Schema.Array(Schema.String),
  state: Schema.Literals(["pending", "running", "done", "failed"]),
});

export const WorkNodeSessionSchema = Schema.Struct({
  workNodeId: Schema.String,
  missionId: Schema.String,
  capsuleId: Schema.String,
  parentWorkNodeId: Schema.optional(Schema.String),
  kind: Schema.Literals(["dispatch", "task", "external"]),
  relation: Schema.Literals(["root", "delegated", "continued", "branched", "prepared", "spawned"]),
  label: Schema.String,
  state: Schema.Literals(["pending", "running", "done", "failed"]),
  startedAt: Schema.optional(Schema.Number),
  completedAt: Schema.optional(Schema.Number),
});

export const DispatchSessionSchema = Schema.Struct({
  ...WorkNodeSessionSchema.fields,
  kind: Schema.Literal("dispatch"),
  dispatchId: Schema.String,
  name: Schema.String,
  modelRequest: Schema.optional(
    Schema.Union([
      Schema.Struct({
        provider: Schema.Literal("openai"),
        model: Schema.String,
        maxOutputTokens: Schema.optional(Schema.Number),
        reasoningEffort: Schema.optional(Schema.Literals(["low", "medium", "high", "xhigh"])),
        textVerbosity: Schema.optional(Schema.Literals(["low", "medium", "high"])),
      }),
      Schema.Struct({
        provider: Schema.Literal("copilot"),
        model: Schema.String,
        maxTokens: Schema.optional(Schema.Number),
      }),
    ]),
  ),
  iteration: Schema.Number,
  state: Schema.Literals(["running", "done", "failed"]),
  usage: UsageSchema,
});

export const RuntimeDispatchEventSchema = Schema.Union([
  Schema.TaggedStruct("WorkNodeStarted", {
    node: WorkNodeSessionSchema,
  }),
  Schema.TaggedStruct("DispatchSessionStarted", {
    session: DispatchSessionSchema,
  }),
  Schema.TaggedStruct("DispatchEvent", {
    workNodeId: Schema.String,
    dispatchId: Schema.String,
    missionId: Schema.String,
    capsuleId: Schema.String,
    event: DispatchEventSchema,
  }),
]);

export const ResearchPocEventSchema = Schema.Union([
  Schema.TaggedStruct("MissionCreated", {
    mission: MissionSessionSchema,
  }),
  RuntimeDispatchEventSchema,
]);

// ---------------------------------------------------------------------------
// CapsuleEvent (serialized)
// ---------------------------------------------------------------------------

export const CapsuleEventSchema = Schema.Struct({
  type: Schema.String,
  at: Schema.String,
  by: Schema.String,
  data: Schema.Unknown,
});
