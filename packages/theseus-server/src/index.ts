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
import { TheseusRpc } from "@theseus.run/core/Rpc";
import * as Satellite from "@theseus.run/core/Satellite";
import { TheseusRuntime, TheseusRuntimeLive } from "@theseus.run/runtime";
import { DispatchRegistry, DispatchRegistryLive } from "@theseus.run/runtime/registry";
import { SqliteDispatchStore, TheseusDbLive } from "@theseus.run/runtime/store";
import { makeToolCatalog, ToolCatalog } from "@theseus.run/runtime/tool-catalog";
import { allTools } from "@theseus.run/tools";
import { Effect, Layer } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { HandlersLive } from "./handlers.ts";
import { CopilotLanguageModelLive } from "./providers/copilot-lm.ts";

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
  DbLive,
);

const RuntimeLive = Layer.provide(Layer.effect(TheseusRuntime)(TheseusRuntimeLive), ServicesLayer);

// The app layer that configures the HttpRouter with RPC routes
const RouterAppLayer = Layer.provideMerge(
  RpcLayer,
  Layer.mergeAll(
    HttpRouter.layer,
    RpcSerialization.layerJson,
    Layer.provideMerge(HandlersLive, RuntimeLive),
  ),
);

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

Effect.runFork(
  program.pipe(
    Effect.provide(HttpLive),
    Effect.scoped,
    Effect.tapCause(
      (cause): Effect.Effect<void> => Effect.logError("[theseus-server] fatal", cause),
    ),
  ),
);

const shutdown = () => {
  console.log("[theseus-server] shutting down...");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
