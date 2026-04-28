/**
 * Theseus Server — Effect RPC over WebSocket.
 *
 * Single process: HTTP server + RPC handlers + SQLite persistence.
 * Replaces the old daemon + bridge + unix socket architecture.
 *
 * Usage: bun run packages/theseus-server/src/index.ts [workspace]
 */

import { join } from "node:path";
import { BunHttpClient } from "@effect/platform-bun";
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import * as Agent from "@theseus.run/core/Agent";
import * as AgentComm from "@theseus.run/core/AgentComm";
import * as Dispatch from "@theseus.run/core/Dispatch";
import { TheseusRpc } from "@theseus.run/core/Rpc";
import * as Satellite from "@theseus.run/core/Satellite";
import { TheseusRuntime } from "@theseus.run/runtime";
import { TheseusRuntimeLive } from "@theseus.run/runtime/live";
import { DispatchRegistry, DispatchRegistryLive } from "@theseus.run/runtime/registry";
import { SqliteDispatchStore, TheseusDbLive } from "@theseus.run/runtime/store";
import { makeToolCatalog, ToolCatalog } from "@theseus.run/runtime/tool-catalog";
import {
  WorkNodeControllers,
  WorkNodeControllersLive,
} from "@theseus.run/runtime/work-node-control";
import { allTools } from "@theseus.run/tools";
import { type Cause, Effect, Layer } from "effect";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { ServerConfig, ServerConfigLive } from "./config.ts";
import { RootAgentsMdCortexNode } from "./cortex/agents-md.ts";
import { ServerEnvLive } from "./env.ts";
import { HandlersLive } from "./handlers.ts";
import { researchGruntBlueprint } from "./poc/research.ts";
import { CopilotConfigLive } from "./providers/copilot/config.ts";
import { ServerLanguageModelGatewayLive } from "./providers/language-model.ts";
import { OpenAIConfigLive } from "./providers/openai/config.ts";
import { RuntimeRpcAdapterLive } from "./runtime-rpc-adapter.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const workspace = process.argv[2] ?? process.cwd();

// ---------------------------------------------------------------------------
// Layer composition
// ---------------------------------------------------------------------------

// Tools
const ToolCatalogLive = Layer.succeed(ToolCatalog)(
  makeToolCatalog([...allTools, AgentComm.dispatchGruntTool]),
);

// Dispatch registry (in-memory active dispatch tracking)
const RegistryLive = Layer.effect(DispatchRegistry)(DispatchRegistryLive);
const WorkNodeControlLive = Layer.provide(
  Layer.effect(WorkNodeControllers)(WorkNodeControllersLive),
  RegistryLive,
);
const BlueprintRegistryLive = Agent.BlueprintRegistryLive([researchGruntBlueprint]);

// SQLite persistence
const DbLive = TheseusDbLive(join(workspace, ".theseus", "theseus.db"));
const PersistentDispatchStore = Layer.provide(SqliteDispatchStore, DbLive);

// Satellite middleware
const RingLive = Satellite.DefaultSatelliteRing;
const CortexLive = Dispatch.CortexStack([RootAgentsMdCortexNode(workspace)]);

// RPC server layer — registers WebSocket endpoint at /rpc on the HttpRouter
const RpcLayer = RpcServer.layerHttp({
  group: TheseusRpc,
  path: "/rpc",
  protocol: "websocket",
});

// HTTP server (Bun)
const HttpLive = Layer.provide(
  Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* ServerConfig;
      return BunHttpServer.layer({ port: config.port });
    }),
  ),
  Layer.provide(ServerConfigLive, ServerEnvLive),
);

// Services layer — all business logic dependencies
const ConfigLive = Layer.provide(ServerConfigLive, ServerEnvLive);
const ProviderConfigLive = Layer.mergeAll(
  Layer.provide(CopilotConfigLive, ServerEnvLive),
  Layer.provide(OpenAIConfigLive, ServerEnvLive),
);
const LanguageModelGatewayLive = Layer.provide(
  ServerLanguageModelGatewayLive,
  Layer.mergeAll(ConfigLive, ProviderConfigLive, BunHttpClient.layer),
);

const ServicesLayer = Layer.mergeAll(
  CortexLive,
  LanguageModelGatewayLive,
  PersistentDispatchStore,
  RingLive,
  ToolCatalogLive,
  RegistryLive,
  WorkNodeControlLive,
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

const program = Effect.gen(function* () {
  const config = yield* ServerConfig;
  console.log(`[theseus-server] starting on port ${config.port} (workspace: ${workspace})`);

  // Build the router app to get the HTTP handler
  const httpEffect = yield* HttpRouter.toHttpEffect(RouterAppLayer);

  // Serve the HTTP handler through the Bun server
  const serveFn = yield* HttpServer.HttpServer;
  yield* serveFn.serve(httpEffect);

  console.log(`[theseus-server] listening on port ${config.port}`);

  // Keep the server alive
  return yield* Effect.never;
});

const main = program.pipe(
  Effect.provide(Layer.mergeAll(HttpLive, ConfigLive)),
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
