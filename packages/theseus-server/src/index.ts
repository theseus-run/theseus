/**
 * Theseus Server — Effect RPC over WebSocket.
 *
 * Single process: HTTP server + RPC handlers + SQLite persistence.
 * Replaces the old daemon + bridge + unix socket architecture.
 *
 * Usage: bun run packages/theseus-server/src/index.ts [workspace]
 */

import { join } from "node:path";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import * as Agent from "@theseus.run/core/Agent";
import { TheseusRpc } from "@theseus.run/core/Rpc";
import * as Satellite from "@theseus.run/core/Satellite";
import { TheseusRuntime } from "@theseus.run/runtime";
import { TheseusRuntimeLive } from "@theseus.run/runtime/live";
import { DispatchRegistry, DispatchRegistryLive } from "@theseus.run/runtime/registry";
import { SqliteDispatchStore, TheseusDbLive } from "@theseus.run/runtime/store";
import { makeToolCatalog, ToolCatalog } from "@theseus.run/runtime/tool-catalog";
import { allTools } from "@theseus.run/tools";
import { type Cause, Effect, Layer } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { HandlersLive } from "./handlers.ts";
import { CopilotLanguageModelLive } from "./providers/copilot-lm.ts";
import { RuntimeRpcAdapterLive } from "./runtime-rpc-adapter.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const workspace = process.argv[2] ?? process.cwd();
const port = Number(process.env["THESEUS_PORT"] ?? 4800);

// ---------------------------------------------------------------------------
// Layer composition
// ---------------------------------------------------------------------------

// Tools
const ToolCatalogLive = Layer.succeed(ToolCatalog)(makeToolCatalog(allTools));

// Dispatch registry (in-memory active dispatch tracking)
const RegistryLive = Layer.effect(DispatchRegistry)(DispatchRegistryLive);
const BlueprintRegistryLive = Agent.BlueprintRegistryLive([]);

// SQLite persistence
const DbLive = TheseusDbLive(join(workspace, ".theseus", "theseus.db"));
const PersistentDispatchStore = Layer.provide(SqliteDispatchStore, DbLive);

// Satellite middleware
const RingLive = Satellite.DefaultSatelliteRing;

// RPC server layer — registers WebSocket endpoint at /rpc on the HttpRouter
const RpcLayer = RpcServer.layerHttp({
  group: TheseusRpc,
  path: "/rpc",
  protocol: "websocket",
});

// HTTP server (Bun)
const HttpLive = BunHttpServer.layer({ port });

// Services layer — all business logic dependencies
const ServicesLayer = Layer.mergeAll(
  CopilotLanguageModelLive,
  PersistentDispatchStore,
  RingLive,
  ToolCatalogLive,
  RegistryLive,
  BlueprintRegistryLive,
  DbLive,
);

const RuntimeLive = Layer.provide(Layer.effect(TheseusRuntime)(TheseusRuntimeLive), ServicesLayer);
const RuntimeRpcAdapterLayer = Layer.provide(RuntimeRpcAdapterLive, RuntimeLive);

// The app layer that configures the HttpRouter with RPC routes
const HandlerLayer = Layer.provideMerge(HandlersLive, RuntimeRpcAdapterLayer);
const RpcDepsLayer = Layer.provideMerge(HandlerLayer, RpcSerialization.layerJson);
const RpcRoutesLayer = Layer.provideMerge(RpcLayer, RpcDepsLayer);
const RouterAppLayer = Layer.provideMerge(RpcRoutesLayer, HttpRouter.layer);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(`[theseus-server] starting on port ${port} (workspace: ${workspace})`);

const program = Effect.gen(function* () {
  // Build the router app to get the HTTP handler
  const httpEffect = yield* HttpRouter.toHttpEffect(RouterAppLayer);

  // Serve the HTTP handler through the Bun server
  const serveFn = yield* HttpServer.HttpServer;
  yield* serveFn.serve(httpEffect);

  console.log(`[theseus-server] listening on port ${port}`);

  // Keep the server alive
  return yield* Effect.never;
});

const main = program.pipe(
  Effect.provide(HttpLive),
  Effect.scoped,
  Effect.catchCause((cause: Cause.Cause<unknown>) =>
    Effect.logError("[theseus-server] fatal", cause),
  ),
) as Effect.Effect<void, never, never>;

Effect.runFork(main);

const shutdown = () => {
  console.log("[theseus-server] shutting down...");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
