/**
 * DaemonBridgeClient — unix socket client implementing DaemonBridge.
 *
 * Connects to the daemon's unix socket, sends BridgeRequests as
 * length-prefixed JSON frames, and routes BridgeResponses back to callers
 * via correlation IDs.
 */

import { Cause, Deferred, Effect, Layer, Queue, Stream } from "effect";
import * as Daemon from "@theseus.run/core/Daemon";
import type * as Agent from "@theseus.run/core/Agent";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { encodeFrame, FrameDecoder, decodeResponse } from "./codec.ts";
import { socketPath } from "./lifecycle.ts";

// ---------------------------------------------------------------------------
// Correlation — route responses to waiting callers
// ---------------------------------------------------------------------------

type Pending =
  | { readonly kind: "oneshot"; readonly deferred: Deferred.Deferred<Daemon.BridgeResponse> }
  | { readonly kind: "stream"; readonly queue: Queue.Queue<Daemon.BridgeResponse, Cause.Done>; readonly deferred: Deferred.Deferred<Daemon.BridgeResponse> };

// ---------------------------------------------------------------------------
// makeDaemonBridgeClient
// ---------------------------------------------------------------------------

export const makeDaemonBridgeClient = (workspace: string) =>
  Effect.gen(function* () {
    const decoder = new FrameDecoder();
    let nextId = 0;

    // Sync map for routing responses from Bun socket callbacks
    const pendingMap = new Map<string, Pending>();

    const genId = (): string => `req-${++nextId}-${Date.now().toString(36)}`;

    // Route incoming response to the correct pending caller
    const onData = (data: Buffer | Uint8Array) => {
      const messages = decoder.push(data);
      for (const raw of messages) {
        const resp = decodeResponse(raw);
        if (!resp) continue;
        const p = pendingMap.get(resp.id);
        if (!p) continue;

        if (p.kind === "stream") {
          if (resp._tag === "Event") {
            Effect.runFork(Queue.offer(p.queue, resp));
          } else if (resp._tag === "Result" || resp._tag === "Error") {
            Effect.runFork(Deferred.succeed(p.deferred, resp));
            Effect.runFork(Queue.end(p.queue));
            pendingMap.delete(resp.id);
          } else {
            // Ack — resolve the initial deferred (dispatch created)
            Effect.runFork(Deferred.succeed(p.deferred, resp));
          }
        } else {
          Effect.runFork(Deferred.succeed(p.deferred, resp));
          pendingMap.delete(resp.id);
        }
      }
    };

    // --- Connect to daemon socket ---
    const connectedSocket = yield* Effect.tryPromise({
      try: () =>
        Bun.connect({
          unix: socketPath(workspace),
          socket: {
            data(_socket, data) { onData(Buffer.from(data)); },
            open() {},
            close() {},
            error() {},
          },
        }),
      catch: (err) =>
        new Daemon.BridgeError({
          code: "CONNECTION_LOST",
          message: `Cannot connect to daemon at ${socketPath(workspace)}: ${err}`,
        }),
    });

    // --- Send a request and wait for the first response ---
    const request = (req: Daemon.BridgeRequest): Effect.Effect<Daemon.BridgeResponse, Daemon.BridgeError> =>
      Effect.gen(function* () {
        const deferred = yield* Deferred.make<Daemon.BridgeResponse>();
        pendingMap.set(req.id, { kind: "oneshot", deferred });
        connectedSocket.write(encodeFrame(req));
        const resp = yield* Deferred.await(deferred);
        if (resp._tag === "Error") {
          return yield* Effect.fail(
            new Daemon.BridgeError({ code: resp.error.code, message: resp.error.message }),
          );
        }
        return resp;
      });

    // --- Send a streaming request ---
    const requestStream = (req: Daemon.BridgeRequest) =>
      Effect.gen(function* () {
        const deferred = yield* Deferred.make<Daemon.BridgeResponse>();
        const queue = yield* Queue.unbounded<Daemon.BridgeResponse, Cause.Done>();
        pendingMap.set(req.id, { kind: "stream", queue, deferred });
        connectedSocket.write(encodeFrame(req));
        const ack = yield* Deferred.await(deferred);
        if (ack._tag === "Error") {
          return yield* Effect.fail(
            new Daemon.BridgeError({ code: ack.error.code, message: ack.error.message }),
          );
        }
        return { ack, queue, id: req.id };
      });

    // --- DaemonBridge implementation ---

    const bridgeDispatch = (
      blueprint: Agent.Blueprint,
      task: string,
      options?: Dispatch.Options,
    ): Effect.Effect<Daemon.DaemonDispatchHandle, Daemon.BridgeError> =>
      Effect.gen(function* () {
        const id = genId();
        const serialized = Daemon.serializeBlueprint(blueprint);
        const { ack, queue } = yield* requestStream({
          _tag: "Dispatch",
          id,
          blueprint: serialized,
          task,
          ...(options !== undefined ? { options } : {}),
        });

        const dispatchId = (ack as { dispatchId?: string }).dispatchId ?? id;
        const resultDeferred = yield* Deferred.make<Agent.Result>();
        const eventQueue = yield* Queue.unbounded<Dispatch.Event, Cause.Done>();

        // Drain response queue → route events to eventQueue, result to deferred
        yield* Effect.forkDetach({ startImmediately: true })(
          Stream.fromQueue(queue).pipe(
            Stream.tap((resp) => {
              if (resp._tag === "Event") {
                return Queue.offer(eventQueue, resp.event);
              }
              if (resp._tag === "Result") {
                return Deferred.succeed(resultDeferred, resp.result).pipe(
                  Effect.tap(() => Queue.end(eventQueue)),
                );
              }
              return Effect.void;
            }),
            Stream.runDrain,
            Effect.ensuring(Queue.end(eventQueue)),
          ),
        );

        const handle: Daemon.DaemonDispatchHandle = {
          dispatchId,
          events: Stream.fromQueue(eventQueue),
          inject: (injection: Dispatch.Injection) =>
            request({
              _tag: "Inject",
              id: genId(),
              dispatchId,
              injection,
            }).pipe(Effect.asVoid, Effect.catch(() => Effect.void)),
          interrupt: request({
            _tag: "Interrupt",
            id: genId(),
            dispatchId,
          }).pipe(Effect.asVoid, Effect.catch(() => Effect.void)),
          result: Deferred.await(resultDeferred),
        };

        return handle;
      });

    const bridgeInject = (
      dispatchId: string,
      injection: Dispatch.Injection,
    ): Effect.Effect<void, Daemon.BridgeError> =>
      request({ _tag: "Inject", id: genId(), dispatchId, injection }).pipe(Effect.asVoid);

    const bridgeSubscribe = (
      dispatchId: string,
    ): Effect.Effect<Stream.Stream<Dispatch.Event>, Daemon.BridgeError> =>
      Effect.gen(function* () {
        const { queue } = yield* requestStream({
          _tag: "Subscribe",
          id: genId(),
          dispatchId,
        });
        return Stream.fromQueue(queue).pipe(
          Stream.filter((resp): resp is Extract<Daemon.BridgeResponse, { _tag: "Event" }> =>
            resp._tag === "Event",
          ),
          Stream.map((resp) => resp.event),
        );
      });

    const bridgeStatus = (): Effect.Effect<Daemon.DaemonStatus, Daemon.BridgeError> =>
      request({ _tag: "Status", id: genId() }).pipe(
        Effect.map((resp) =>
          resp._tag === "StatusInfo"
            ? { pid: 0, uptime: 0, dispatches: resp.dispatches }
            : { pid: 0, uptime: 0, dispatches: [] },
        ),
      );

    const bridgeShutdown = (_graceful?: boolean): Effect.Effect<void, Daemon.BridgeError> =>
      request({ _tag: "Shutdown", id: genId() }).pipe(Effect.asVoid);

    return {
      dispatch: bridgeDispatch,
      inject: bridgeInject,
      subscribe: bridgeSubscribe,
      status: bridgeStatus,
      shutdown: bridgeShutdown,
    };
  });

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const DaemonBridgeClientLive = (workspace: string) =>
  Layer.effect(Daemon.DaemonBridge)(makeDaemonBridgeClient(workspace));
