/**
 * DaemonBridge — transport-agnostic service for CLI↔daemon communication.
 *
 * Implementations:
 *   - UnixSocketBridge (theseus-runtime) — local daemon via unix socket
 *   - WebSocketBridge (future) — remote daemon via WebSocket
 *   - DirectBridge (theseus-runtime) — in-process, no daemon (testing / embedded)
 *
 * The CLI depends only on this interface. Transport is a Layer swap.
 */

import type { Effect, Stream } from "effect";
import * as ServiceMap from "effect/ServiceMap";
import type { Blueprint } from "../agent/index.ts";
import type { DispatchEvent, DispatchOptions, Injection } from "../dispatch/types.ts";
import type { DaemonDispatchHandle } from "./handle.ts";
import type { BridgeError, DaemonStatus } from "./protocol.ts";

// ---------------------------------------------------------------------------
// DaemonBridge — service definition
// ---------------------------------------------------------------------------

export class DaemonBridge extends ServiceMap.Service<
  DaemonBridge,
  {
    /**
     * Start a dispatch and receive a handle for streaming events / injecting.
     * The daemon resolves tools by name from its tool registry.
     * Implicitly subscribes — events flow immediately on the returned handle.
     */
    readonly dispatch: (
      blueprint: Blueprint,
      task: string,
      options?: DispatchOptions,
    ) => Effect.Effect<DaemonDispatchHandle, BridgeError>;

    /**
     * Push an injection into a running dispatch.
     * Convenience for when you have a dispatchId but not the handle.
     */
    readonly inject: (
      dispatchId: string,
      injection: Injection,
    ) => Effect.Effect<void, BridgeError>;

    /**
     * Subscribe to events from an existing dispatch (e.g. reconnecting).
     * Returns a live event stream. Late subscribers may miss earlier events.
     */
    readonly subscribe: (
      dispatchId: string,
    ) => Effect.Effect<Stream.Stream<DispatchEvent>, BridgeError>;

    /**
     * Query daemon health and active dispatches.
     */
    readonly status: () => Effect.Effect<DaemonStatus, BridgeError>;

    /**
     * Request daemon shutdown. Graceful by default — waits for active
     * dispatches to complete (with timeout), then exits.
     */
    readonly shutdown: (graceful?: boolean) => Effect.Effect<void, BridgeError>;
  }
>()("DaemonBridge") {}
