/**
 * Daemon — transport-agnostic CLI↔daemon communication.
 *
 * Internal barrel. Prefer namespace import:
 *   import * as Daemon from "@theseus.run/core/Daemon"
 */

export { DaemonBridge } from "./bridge.ts";
export type { DaemonDispatchHandle } from "./handle.ts";
export { BridgeError } from "./protocol.ts";
export type {
  BridgeRequest,
  BridgeResponse,
  BridgeErrorCode,
  DaemonStatus,
  DispatchStatusEntry,
  SerializedBlueprint,
  SerializedToolRef,
} from "./protocol.ts";
export { serializeEvent, deserializeEvent, serializeBlueprint } from "./protocol.ts";
