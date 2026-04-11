/**
 * Daemon — server, client, lifecycle for theseus-runtime.
 */

export { encodeFrame, FrameDecoder, decodeRequest, decodeResponse } from "./codec.ts";
export { DispatchRegistry, DispatchRegistryLive } from "./registry.ts";
export {
  socketPath, pidfilePath,
  writePidfile, readPidfile, removePidfile,
  removeSocket, cleanupDaemonFiles,
  isProcessAlive, isDaemonRunning,
} from "./lifecycle.ts";
export { DaemonServer, DaemonServerLive, ToolRegistry, makeToolRegistry } from "./server.ts";
export { makeDaemonBridgeClient, DaemonBridgeClientLive } from "./client.ts";
