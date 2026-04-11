/**
 * Daemon entry point — start the daemon server process.
 *
 * Usage: bun run packages/theseus-runtime/src/daemon/start.ts [workspace]
 *
 * Composes all layers and starts listening on the unix socket.
 */

import { Effect, Layer } from "effect";
import * as Dispatch from "@theseus.run/core/Dispatch";
import { allTools } from "@theseus.run/tools";
import { CopilotLanguageModelLive } from "../providers/copilot-lm.ts";
import { DaemonServer, DaemonServerLive, ToolRegistry, makeToolRegistry } from "./server.ts";
import { DispatchRegistry, DispatchRegistryLive } from "./registry.ts";

const workspace = process.argv[2] ?? process.cwd();

const ToolRegistryLive = Layer.succeed(ToolRegistry, makeToolRegistry(allTools));
const RegistryLive = Layer.effect(DispatchRegistry)(DispatchRegistryLive);

const ServerLive = Layer.effect(DaemonServer)(DaemonServerLive);

const AppLayer = Layer.provideMerge(
  ServerLive,
  Layer.mergeAll(CopilotLanguageModelLive, Dispatch.Defaults, ToolRegistryLive, RegistryLive),
);

const program = Effect.gen(function* () {
  const server = yield* DaemonServer;
  yield* server.start(workspace);
  console.log(`[theseus-daemon] listening at ${workspace}/.theseus/daemon.sock (pid ${process.pid})`);
  yield* Effect.never;
});

Effect.runFork(
  program.pipe(
    Effect.provide(AppLayer),
    Effect.tapCause((cause) =>
      Effect.sync(() => console.error("[theseus-daemon] fatal:", cause)),
    ),
  ),
);

const shutdown = () => {
  console.log("[theseus-daemon] shutting down...");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
