/**
 * Daemon namespace barrel.
 *
 *   import * as Daemon from "@theseus.run/core/Daemon"
 *   Daemon.DaemonBridge      // service class
 *   Daemon.BridgeRequest     // protocol types
 *   Daemon.serializeBlueprint // helpers
 */

export {
  DaemonBridge,
  type DaemonDispatchHandle,
  type BridgeRequest,
  type BridgeResponse,
  BridgeError,
  type BridgeErrorCode,
  type DaemonStatus,
  type DispatchStatusEntry,
  type SerializedBlueprint,
  type SerializedToolRef,
  serializeEvent,
  deserializeEvent,
  serializeBlueprint,
} from "./daemon/index.ts";
