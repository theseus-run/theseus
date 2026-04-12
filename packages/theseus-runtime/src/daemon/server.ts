/**
 * DaemonServer — unix socket server that routes BridgeRequests to dispatch.
 *
 * Uses Bun.listen with unix socket. Each client connection gets a FrameDecoder.
 * Requests are decoded, routed to handlers, and responses are written back
 * as length-prefixed JSON frames.
 */

import { Effect, Layer, Stream, Match } from "effect";
import * as ServiceMap from "effect/ServiceMap";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Agent from "@theseus.run/core/Agent";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import * as Daemon from "@theseus.run/core/Daemon";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Tool from "@theseus.run/core/Tool";
import { encodeFrame, FrameDecoder, decodeRequest } from "./codec.ts";
import { DispatchRegistry } from "./registry.ts";
import { TheseusDb } from "../store/sqlite.ts";
import { SqliteCapsuleLive } from "../store/sqlite-capsule.ts";
import { socketPath, writePidfile, cleanupDaemonFiles, removeSocket } from "./lifecycle.ts";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// ToolRegistry — resolves tool names to full Tool objects
// ---------------------------------------------------------------------------

export class ToolRegistry extends ServiceMap.Service<
  ToolRegistry,
  { readonly resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.Any> }
>()("ToolRegistry") {}

export const makeToolRegistry = (tools: ReadonlyArray<Tool.Any>) => {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    resolve: (names: ReadonlyArray<string>): ReadonlyArray<Tool.Any> =>
      names.length === 0
        ? tools as Tool.Any[] // empty = all tools
        : names.flatMap((n) => {
            const tool = byName.get(n);
            return tool ? [tool] : [];
          }),
  };
};

// ---------------------------------------------------------------------------
// resolveBlueprint — SerializedBlueprint → Blueprint
// ---------------------------------------------------------------------------

const resolveBlueprint = (
  serialized: Daemon.SerializedBlueprint,
  toolRegistry: { resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.Any> },
): Agent.Blueprint => ({
  name: serialized.name,
  systemPrompt: serialized.systemPrompt,
  tools: toolRegistry.resolve(serialized.tools.map((t) => t.name)),
  ...(serialized.maxIterations !== undefined ? { maxIterations: serialized.maxIterations } : {}),
  ...(serialized.model !== undefined ? { model: serialized.model } : {}),
});

// ---------------------------------------------------------------------------
// DaemonServer — service definition
// ---------------------------------------------------------------------------

export class DaemonServer extends ServiceMap.Service<
  DaemonServer,
  {
    readonly start: (workspace: string) => Effect.Effect<void>;
    readonly stop: () => Effect.Effect<void>;
  }
>()("DaemonServer") {}

// ---------------------------------------------------------------------------
// DaemonServerLive
// ---------------------------------------------------------------------------

type BunSocket = {
  write: (data: Buffer | Uint8Array) => number;
  end: () => void;
  data: { decoder: FrameDecoder; subscriptions: Set<string> };
};

export const DaemonServerLive = Effect.gen(function* () {
  const registry = yield* DispatchRegistry;
  const toolRegistry = yield* ToolRegistry;

  // Capture ambient services as a Layer so we can provide them to dispatch()
  // when running from Bun socket callbacks.
  const lm = yield* LanguageModel.LanguageModel;
  const ring = yield* Satellite.Ring;
  const log = yield* Dispatch.Log;
  const theseusDb = yield* TheseusDb;
  const dbLayer = Layer.succeed(TheseusDb, theseusDb);
  const depsLayer = Layer.mergeAll(
    Layer.succeed(LanguageModel.LanguageModel, lm),
    Layer.succeed(Satellite.Ring, ring),
    Layer.succeed(Dispatch.Log, log),
  );

  let server: ReturnType<typeof Bun.listen> | null = null;
  let workspace = "";

  const sendResponse = (socket: BunSocket, response: Daemon.BridgeResponse): void => {
    try { socket.write(encodeFrame(response)); } catch { /* socket closed */ }
  };

  const sendError = (socket: BunSocket, id: string, code: Daemon.BridgeErrorCode, message: string): void => {
    sendResponse(socket, {
      _tag: "Error",
      id,
      error: new Daemon.BridgeError({ code, message }),
    });
  };

  const handleRequest = (
    socket: BunSocket,
    req: Daemon.BridgeRequest,
  ): Effect.Effect<void> =>
    (Match.value(req._tag) as any).pipe(
      Match.when("Ping", () =>
        Effect.sync(() => sendResponse(socket, { _tag: "Pong", id: req.id })),
      ),

      Match.when("Status", () =>
        registry.list().pipe(
          Effect.tap((dispatches) =>
            Effect.sync(() => sendResponse(socket, { _tag: "StatusInfo", id: req.id, dispatches })),
          ),
          Effect.asVoid,
        ),
      ),

      Match.when("Dispatch", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "Dispatch" }>;
        return Effect.gen(function* () {
          const blueprint = resolveBlueprint(r.blueprint, toolRegistry);
          const resolved = toolRegistry.resolve(r.blueprint.tools.map((t) => t.name));
          const missing = r.blueprint.tools
            .filter((t) => !resolved.some((rt) => rt.name === t.name))
            .map((t) => t.name);

          if (missing.length > 0) {
            sendError(socket, r.id, "TOOL_NOT_FOUND", `Unknown tools: ${missing.join(", ")}`);
            return;
          }

          // Create per-dispatch Capsule backed by SQLite
          const capsuleLayer = Layer.provide(SqliteCapsuleLive(blueprint.name), dbLayer);
          const getCapsule = Effect.gen(function* () { return yield* CapsuleNs.Capsule; });
          const capsule = yield* Effect.provide(getCapsule, capsuleLayer);

          // Log dispatch start to capsule
          yield* capsule.log({ type: "dispatch.start", by: "runtime", data: { task: r.task, agent: blueprint.name } });

          const handle = yield* Effect.provide(
            Dispatch.dispatch(blueprint, r.task, r.options),
            depsLayer,
          );
          yield* registry.register(handle, blueprint.name);

          sendResponse(socket, { _tag: "Ack", id: r.id, dispatchId: handle.dispatchId });
          socket.data.subscriptions.add(handle.dispatchId);

          // Log capsuleId → dispatchId mapping
          yield* capsule.log({ type: "dispatch.id", by: "runtime", data: { dispatchId: handle.dispatchId, capsuleId: capsule.id } });

          // Stream events to client in background
          // Skip deltas over the wire — CLI shows full text from AgentResult.content
          const skipOverWire = new Set(["TextDelta", "ThinkingDelta", "Thinking"]);
          yield* Effect.forkDetach({ startImmediately: true })(
            Stream.tap(handle.events, (event: Dispatch.Event) =>
              Effect.sync(() => {
                if (!skipOverWire.has(event._tag) && socket.data.subscriptions.has(handle.dispatchId)) {
                  sendResponse(socket, {
                    _tag: "Event",
                    id: r.id,
                    dispatchId: handle.dispatchId,
                    event: Daemon.serializeEvent(event) as Dispatch.Event,
                  });
                }
                if (event._tag === "Calling") {
                  Effect.runFork(registry.updateStatus(handle.dispatchId, { iteration: event.iteration }));
                }
              }),
            ).pipe(
              Stream.runDrain,
              Effect.tap(() =>
                handle.result.pipe(
                  Effect.tap((result) =>
                    Effect.gen(function* () {
                      // Log dispatch completion to capsule
                      yield* capsule.log({
                        type: "dispatch.done",
                        by: "runtime",
                        data: { dispatchId: handle.dispatchId, result: result.result, summary: result.summary },
                      });
                      sendResponse(socket, { _tag: "Result", id: r.id, dispatchId: handle.dispatchId, result });
                    }),
                  ),
                  Effect.tap(() => registry.updateStatus(handle.dispatchId, { state: "done" })),
                  Effect.tapError(() => registry.updateStatus(handle.dispatchId, { state: "failed" })),
                  Effect.catch(() => Effect.void),
                ),
              ),
            ),
          );
        });
      }),

      Match.when("Inject", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "Inject" }>;
        return Effect.gen(function* () {
          const handle = yield* registry.get(r.dispatchId);
          if (handle === null) {
            sendError(socket, r.id, "NOT_FOUND", `Dispatch ${r.dispatchId} not found`);
            return;
          }
          yield* handle.inject(r.injection);
          sendResponse(socket, { _tag: "Ack", id: r.id });
        });
      }),

      Match.when("Interrupt", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "Interrupt" }>;
        return Effect.gen(function* () {
          const handle = yield* registry.get(r.dispatchId);
          if (handle === null) {
            sendError(socket, r.id, "NOT_FOUND", `Dispatch ${r.dispatchId} not found`);
            return;
          }
          yield* handle.interrupt;
          sendResponse(socket, { _tag: "Ack", id: r.id });
        });
      }),

      Match.when("Subscribe", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "Subscribe" }>;
        return Effect.gen(function* () {
          const handle = yield* registry.get(r.dispatchId);
          if (handle === null) {
            sendError(socket, r.id, "NOT_FOUND", `Dispatch ${r.dispatchId} not found`);
            return;
          }
          socket.data.subscriptions.add(r.dispatchId);
          sendResponse(socket, { _tag: "Ack", id: r.id });
        });
      }),

      Match.when("Unsubscribe", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "Unsubscribe" }>;
        return Effect.sync(() => {
          socket.data.subscriptions.delete(r.dispatchId);
          sendResponse(socket, { _tag: "Ack", id: r.id });
        });
      }),

      Match.when("Shutdown", () =>
        Effect.gen(function* () {
          sendResponse(socket, { _tag: "Ack", id: req.id });
          yield* stop();
        }),
      ),

      Match.when("ListDispatches", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "ListDispatches" }>;
        return log.list(r.limit !== undefined ? { limit: r.limit } : undefined).pipe(
          Effect.tap((dispatches) =>
            Effect.sync(() => sendResponse(socket, { _tag: "DispatchList", id: r.id, dispatches })),
          ),
          Effect.asVoid,
        );
      }),

      Match.when("GetDispatchEvents", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "GetDispatchEvents" }>;
        return log.events(r.dispatchId).pipe(
          Effect.tap((events) =>
            Effect.sync(() => sendResponse(socket, { _tag: "DispatchEventsInfo", id: r.id, events })),
          ),
          Effect.asVoid,
        );
      }),

      Match.when("GetCapsuleEvents", () => {
        const r = req as Extract<Daemon.BridgeRequest, { _tag: "GetCapsuleEvents" }>;
        return Effect.gen(function* () {
          // Create a temporary capsule reader for the given capsuleId
          // by querying the DB directly
          const rows = theseusDb.db.prepare(
            "SELECT type, at, by, data_json FROM capsule_events WHERE capsule_id = ? ORDER BY id",
          ).all(r.capsuleId) as Array<{ type: string; at: string; by: string; data_json: string }>;
          const events = rows.map((row) => ({
            type: row.type,
            at: row.at,
            by: row.by,
            data: JSON.parse(row.data_json),
          }));
          sendResponse(socket, { _tag: "CapsuleEventsInfo", id: r.id, events });
        });
      }),

      Match.orElse(() =>
        Effect.sync(() => sendError(socket, (req as any).id ?? "unknown", "INVALID_REQUEST", "Unknown request type")),
      ),
    );

  const start = (ws: string): Effect.Effect<void> =>
    Effect.sync(() => {
      workspace = ws;
      const sockDir = dirname(socketPath(workspace));
      if (!existsSync(sockDir)) mkdirSync(sockDir, { recursive: true });
      removeSocket(workspace);

      server = Bun.listen({
        unix: socketPath(workspace),
        socket: {
          open(socket: any) {
            socket.data = { decoder: new FrameDecoder(), subscriptions: new Set() };
          },
          data(socket: any, data: any) {
            const s = socket as BunSocket;
            const messages = s.data.decoder.push(Buffer.from(data));
            for (const raw of messages) {
              const req = decodeRequest(raw);
              if (req === null) {
                sendError(s, (raw as any)?.id ?? "unknown", "INVALID_REQUEST", "Malformed request");
                continue;
              }
              Effect.runFork(handleRequest(s, req));
            }
          },
          close() {},
          error() {},
        },
      });

      writePidfile(workspace);
    });

  const stop = (): Effect.Effect<void> =>
    Effect.sync(() => {
      if (server) {
        server.stop();
        server = null;
      }
      cleanupDaemonFiles(workspace);
    });

  return { start, stop };
});
