/**
 * icarus — interactive CLI for theseus daemon.
 *
 * Connects to a running theseus daemon over unix socket.
 * If no daemon is running, spawns one as a child process.
 *
 * Usage: bun run bin/icarus.tsx [initial message]
 */

import { render } from "ink";
import { Effect, Stream } from "effect";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type * as Agent from "@theseus.run/core/Agent";
import type * as Daemon from "@theseus.run/core/Daemon";
import {
  isDaemonRunning,
  cleanupDaemonFiles,
  makeDaemonBridgeClient,
} from "@theseus.run/runtime/daemon";
import { createStore } from "../src/store.ts";
import App from "../src/app.tsx";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const workspace = process.cwd();
const restartDaemon = process.argv.includes("--restart");
const args = process.argv.slice(2).filter((a) => a !== "--restart");
const initialMessage = args.join(" ") || null;

const DAEMON_START_SCRIPT = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../../theseus-runtime/src/daemon/start.ts",
);

const BLUEPRINT: Agent.Blueprint = {
  name: "icarus",
  systemPrompt:
    "You are a helpful coding assistant. Use your tools to explore and modify code. Be concise.",
  tools: [], // empty = daemon gives all tools
  maxIterations: 30,
};

// ---------------------------------------------------------------------------
// Daemon lifecycle
// ---------------------------------------------------------------------------

const killDaemon = (): void => {
  const status = isDaemonRunning(workspace);
  if (status.running && status.pid) {
    try { process.kill(status.pid, "SIGTERM"); } catch { /* ignore */ }
    Bun.sleepSync(200);
  }
  cleanupDaemonFiles(workspace);
};

const startDaemon = (): void => {
  // biome-ignore lint/suspicious/noConsole: startup info
  console.log("[icarus] starting daemon...");
  const child = spawn("bun", ["run", DAEMON_START_SCRIPT, workspace], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  Bun.sleepSync(500);
  const check = isDaemonRunning(workspace);
  if (!check.running) {
    // biome-ignore lint/suspicious/noConsole: error
    console.error("[icarus] failed to start daemon");
    process.exit(1);
  }
  // biome-ignore lint/suspicious/noConsole: startup info
  console.log(`[icarus] daemon started (pid ${check.pid})`);
};

const ensureDaemon = (restart: boolean): void => {
  if (restart) {
    killDaemon();
    startDaemon();
    return;
  }

  const status = isDaemonRunning(workspace);
  if (status.running) return;
  startDaemon();
};

// ---------------------------------------------------------------------------
// Session — holds the active dispatch handle for multi-turn chat
// ---------------------------------------------------------------------------

interface Session {
  handle: Daemon.DaemonDispatchHandle;
  draining: boolean;
}

let session: Session | null = null;

const startSession = (
  store: ReturnType<typeof createStore>,
  taskText: string,
) => {
  store.pushUserMessage(taskText);

  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* makeDaemonBridgeClient(workspace);
      const handle = yield* client.dispatch(BLUEPRINT, taskText);
      session = { handle, draining: true };

      // Drain events into store
      yield* Stream.tap(handle.events, (event: Dispatch.Event) =>
        Effect.sync(() => store.push(event)),
      ).pipe(
        Stream.takeUntil((e) => e._tag === "Done"),
        Stream.runDrain,
      );

      session = { handle, draining: false };
    }),
  ).catch((e) => {
    // biome-ignore lint/suspicious/noConsole: error
    console.error("[dispatch error]", e);
    session = null;
  });
};

const injectMessage = (store: ReturnType<typeof createStore>, text: string) => {
  if (!session) return;

  // Add user message to store for display
  store.pushUserMessage(text);

  // If previous response is done, start a new session
  if (!session.draining) {
    startSession(store, text);
    return;
  }

  // Inject user message into the running dispatch
  Effect.runPromise(
    session.handle.inject({
      _tag: "AppendMessages",
      messages: [{ role: "user" as const, content: text }],
    }) as Effect.Effect<void>,
  ).catch((e) => {
    // biome-ignore lint/suspicious/noConsole: error
    console.error("[inject error]", e);
  });
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  ensureDaemon(restartDaemon);

  const store = createStore();

  const onSubmit = (input: string) => {
    if (input === "/exit" || input === "/quit") {
      process.exit(0);
    }

    if (input === "/new") {
      session = null;
      store.reset();
      return;
    }

    if (input.startsWith("/status")) {
      Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* makeDaemonBridgeClient(workspace);
          const status = yield* client.status();
          store.pushSystem(`status: ${JSON.stringify(status)}`);
        }),
      ).catch((e) => store.pushSystem(`status error: ${e}`));
      return;
    }

    if (input.startsWith("/shutdown")) {
      Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* makeDaemonBridgeClient(workspace);
          yield* client.shutdown();
          store.pushSystem("daemon shut down");
          process.exit(0);
        }),
      ).catch((e) => store.pushSystem(`shutdown error: ${e}`));
      return;
    }

    // Chat: either start a new session or inject into existing
    if (!session || !session.draining) {
      startSession(store, input);
    } else {
      injectMessage(store, input);
    }
  };

  const { waitUntilExit } = render(
    <App store={store} onSubmit={onSubmit} />,
  );

  if (initialMessage) {
    startSession(store, initialMessage);
  }

  await waitUntilExit();
};

main().catch((e) => {
  console.error("[icarus] fatal:", e);
  process.exit(1);
});
