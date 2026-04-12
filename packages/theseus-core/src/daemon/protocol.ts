/**
 * Daemon protocol — transport-agnostic request/response envelopes.
 *
 * These types define the wire format between CLI (client) and daemon (server).
 * The transport layer (unix socket now, WebSocket later) frames these as JSON.
 * All types are plain data — no Effect services, no functions.
 */

import { Data } from "effect";
import type { AgentResult } from "../agent/index.ts";
import type { DispatchEvent, DispatchOptions, Injection, Usage } from "../dispatch/types.ts";
import type { DispatchSummary, EventEntry } from "../dispatch/log.ts";
import type { CapsuleEvent } from "../capsule/index.ts";

// ---------------------------------------------------------------------------
// SerializedBlueprint — Blueprint without execute functions
// ---------------------------------------------------------------------------

/** Tool metadata sent over the wire. Daemon resolves the full tool by name. */
export interface SerializedToolRef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
}

/** Blueprint as data — no runtime functions. Daemon looks up tools by name. */
export interface SerializedBlueprint {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<SerializedToolRef>;
  readonly maxIterations?: number;
  readonly model?: string;
}

// ---------------------------------------------------------------------------
// BridgeRequest — client → daemon
// ---------------------------------------------------------------------------

export type BridgeRequest =
  | { readonly _tag: "Dispatch";          readonly id: string; readonly blueprint: SerializedBlueprint; readonly task: string; readonly options?: DispatchOptions; readonly continueFrom?: string }
  | { readonly _tag: "Inject";            readonly id: string; readonly dispatchId: string; readonly injection: Injection }
  | { readonly _tag: "Interrupt";         readonly id: string; readonly dispatchId: string }
  | { readonly _tag: "Subscribe";         readonly id: string; readonly dispatchId: string }
  | { readonly _tag: "Unsubscribe";       readonly id: string; readonly dispatchId: string }
  | { readonly _tag: "Status";            readonly id: string }
  | { readonly _tag: "Shutdown";          readonly id: string; readonly graceful?: boolean }
  | { readonly _tag: "Ping";              readonly id: string }
  | { readonly _tag: "ListDispatches";    readonly id: string; readonly limit?: number }
  | { readonly _tag: "GetDispatchEvents"; readonly id: string; readonly dispatchId: string }
  | { readonly _tag: "GetCapsuleEvents";  readonly id: string; readonly capsuleId: string }
  | { readonly _tag: "GetMessages";       readonly id: string; readonly dispatchId: string }

// ---------------------------------------------------------------------------
// BridgeResponse — daemon → client
// ---------------------------------------------------------------------------

export type BridgeResponse =
  | { readonly _tag: "Ack";                readonly id: string; readonly dispatchId?: string }
  | { readonly _tag: "Event";              readonly id: string; readonly dispatchId: string; readonly event: DispatchEvent }
  | { readonly _tag: "Result";             readonly id: string; readonly dispatchId: string; readonly result: AgentResult }
  | { readonly _tag: "Error";              readonly id: string; readonly error: BridgeError }
  | { readonly _tag: "StatusInfo";         readonly id: string; readonly dispatches: ReadonlyArray<DispatchStatusEntry> }
  | { readonly _tag: "Pong";               readonly id: string }
  | { readonly _tag: "DispatchList";       readonly id: string; readonly dispatches: ReadonlyArray<DispatchSummary> }
  | { readonly _tag: "DispatchEventsInfo"; readonly id: string; readonly events: ReadonlyArray<EventEntry> }
  | { readonly _tag: "CapsuleEventsInfo";  readonly id: string; readonly events: ReadonlyArray<CapsuleEvent> }
  | { readonly _tag: "Messages";           readonly id: string; readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }> }

// ---------------------------------------------------------------------------
// BridgeError — typed error for protocol-level failures
// ---------------------------------------------------------------------------

export class BridgeError extends Data.TaggedError("BridgeError")<{
  readonly code: BridgeErrorCode;
  readonly message: string;
}> {}

export type BridgeErrorCode =
  | "NOT_FOUND"        // dispatchId does not exist
  | "ALREADY_EXISTS"   // dispatch with this id already running
  | "INVALID_REQUEST"  // malformed request
  | "TOOL_NOT_FOUND"   // blueprint references unknown tool
  | "INTERNAL"         // daemon internal error
  | "SHUTTING_DOWN"    // daemon is shutting down, reject new work
  | "CONNECTION_LOST"  // client-side: connection to daemon dropped

// ---------------------------------------------------------------------------
// DaemonStatus — health + active dispatches
// ---------------------------------------------------------------------------

export interface DispatchStatusEntry {
  readonly dispatchId: string;
  readonly agent: string;
  readonly iteration: number;
  readonly state: "running" | "done" | "failed";
  readonly usage: Usage;
}

export interface DaemonStatus {
  readonly pid: number;
  readonly uptime: number;
  readonly dispatches: ReadonlyArray<DispatchStatusEntry>;
}

// ---------------------------------------------------------------------------
// Serialization helpers — for DispatchEvent edge cases
// ---------------------------------------------------------------------------

/**
 * Serialize a DispatchEvent to a plain JSON-safe object.
 * Handles ToolCallError.cause which may contain non-serializable Effect errors.
 */
export const serializeEvent = (event: DispatchEvent): unknown => {
  if (event._tag === "ToolError") {
    const { error, ...rest } = event;
    return {
      ...rest,
      error: {
        _tag: error._tag,
        callId: error.callId,
        name: error.name,
        ...("raw" in error ? { raw: error.raw } : {}),
        ...("args" in error ? { args: error.args } : {}),
        ...("cause" in error ? { cause: { _tag: (error.cause as { _tag?: string })?._tag, message: String(error.cause) } } : {}),
      },
    };
  }
  return event;
};

/**
 * Deserialize a plain object back to a DispatchEvent.
 * ToolError events lose their Data.TaggedError prototype but retain _tag + data.
 */
export const deserializeEvent = (raw: unknown): DispatchEvent =>
  raw as DispatchEvent;

// ---------------------------------------------------------------------------
// Blueprint serialization
// ---------------------------------------------------------------------------

/** Extract wire-safe metadata from a Blueprint's tools. */
export const serializeBlueprint = (bp: {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<{ readonly name: string; readonly description: string; readonly inputSchema: unknown }>;
  readonly maxIterations?: number;
  readonly model?: string;
}): SerializedBlueprint => ({
  name: bp.name,
  systemPrompt: bp.systemPrompt,
  tools: bp.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
  ...(bp.maxIterations !== undefined ? { maxIterations: bp.maxIterations } : {}),
  ...(bp.model !== undefined ? { model: bp.model } : {}),
});
