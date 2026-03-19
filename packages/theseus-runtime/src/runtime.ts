/**
 * Runtime — composes all layers and exports the main program.
 *
 * Layer dependency graph:
 *
 *   RuntimeBusLive   ← standalone fallback (icarus-cli replaces this with InkRuntimeBusLive)
 *   TuiLoggerLive    ← requires RuntimeBus
 *   AgentRegistryLive← requires TuiLogger
 *   CopilotProviderLive ← owns its own BunHttpClient
 *   TsServiceLive    ← initialised from workspace root
 *   AppLayer         = all of the above merged
 *
 * Tool sets are built inside main() where TsService is available,
 * and passed directly to TheseusAgent — no shared ToolRegistry layer.
 * Atlas receives read-only tools (no searchReplace).
 * Forge receives the full tool set.
 *
 * The main program reads RuntimeCommands from RuntimeBus instead of
 * reading raw stdin — the interface layer (icarus-cli) is responsible
 * for translating user input into RuntimeCommand values.
 */
import { Cause, Effect, Layer, Queue, Schedule } from "effect";
import type { TheseusMsg } from "./agents/theseus-agent.ts";
import { TheseusAgent } from "./agents/theseus-agent.ts";
import { Config } from "./config.ts";
import type { ChatMessage, ToolDefinition } from "./llm/index.ts";
import { CopilotProvider, CopilotProviderLive } from "./llm/index.ts";
import { AgentRegistry, AgentRegistryLive } from "./registry.ts";
import type { RuntimeCommand, UIEvent } from "./runtime-bus.ts";
import { RuntimeBus } from "./runtime-bus.ts";
import {
  makeFsTools,
  makeReadOnlyFsTools,
  makeShellTool,
  makeTsServiceLayer,
  makeTsTools,
  TsService,
} from "./tools/index.ts";
import { TuiLogger, TuiLoggerLive } from "./tui.ts";

// ---------------------------------------------------------------------------
// Workspace root — where tsconfig.json lives for the runtime package
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// TS Language Service layer (initialised once, warm for the session)
// ---------------------------------------------------------------------------

const TsServiceLive = makeTsServiceLayer(WORKSPACE_ROOT);

// ---------------------------------------------------------------------------
// RuntimeBus live — allocate the two queues
// (icarus-cli provides this layer via InkRuntimeBusLive; this is the
//  standalone fallback for running the runtime headlessly in tests.)
// ---------------------------------------------------------------------------

export const RuntimeBusLive: Layer.Layer<RuntimeBus> = Layer.effect(RuntimeBus)(
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<UIEvent>();
    const commands = yield* Queue.unbounded<RuntimeCommand>();
    return RuntimeBus.of({ events, commands });
  }),
);

// ---------------------------------------------------------------------------
// Layer composition
// ---------------------------------------------------------------------------

export const RuntimeLayer = AgentRegistryLive.pipe(Layer.provide(TuiLoggerLive));

export const AppLayer = Layer.mergeAll(
  RuntimeLayer,
  TuiLoggerLive,
  CopilotProviderLive,
  TsServiceLive,
);

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

export const main = Effect.gen(function* () {
  const tui = yield* TuiLogger;
  const registry = yield* AgentRegistry;
  const copilot = yield* CopilotProvider;
  const bus = yield* RuntimeBus;
  const { languageService } = yield* TsService;

  yield* tui.info("theseus runtime starting…");
  yield* tui.info(`workspace: ${WORKSPACE_ROOT}`);

  // Build per-agent tool sets.
  // Atlas: read-only (no searchReplace). Forge: full set.
  const tsTools = makeTsTools(WORKSPACE_ROOT, languageService);
  const leafTools = {
    atlas: [...makeReadOnlyFsTools(WORKSPACE_ROOT), makeShellTool(WORKSPACE_ROOT), ...tsTools],
    forge: [...makeFsTools(WORKSPACE_ROOT), makeShellTool(WORKSPACE_ROOT), ...tsTools],
  };

  // Wrap copilot.chat — retry transient errors, timeout + errors become content so the agent loop never crashes
  const retrySchedule = Schedule.spaced("2 seconds").pipe(Schedule.take(2));
  const callLLM = (messages: ReadonlyArray<ChatMessage>, tools: ReadonlyArray<ToolDefinition>) =>
    copilot.chat(messages, { model: Config.model, tools }).pipe(
      Effect.retry(retrySchedule),
      Effect.timeout("120 seconds"),
      Effect.catchCause((cause) => {
        const msg = Cause.pretty(cause);
        return Effect.succeed({
          content: `[LLM error: ${msg}]`,
          model: "unknown",
          finishReason: "error" as const,
          toolCalls: [] as const,
          usage: { promptTokens: 0, completionTokens: 0 },
        });
      }),
    );

  const theseus = new TheseusAgent(callLLM, leafTools, bus.events);
  const coordinatorId = theseus.id;
  yield* registry.spawn(theseus);

  yield* registry.send(coordinatorId, { _tag: "Start" } satisfies TheseusMsg);

  yield* tui.info("ready — waiting for commands from interface layer");

  // Command loop — block on RuntimeCommand queue instead of raw stdin.
  // The interface layer (icarus-cli) offers commands to bus.commands.
  while (true) {
    const cmd = yield* Queue.take(bus.commands);

    if (cmd._tag === "Stop") {
      yield* tui.info("stop command received — shutting down");
      break;
    }

    if (cmd._tag === "Dispatch") {
      const instruction = cmd.instruction.trim();
      if (instruction) {
        yield* tui.info(
          `dispatch: ${instruction.slice(0, 60)}${instruction.length > 60 ? "…" : ""}`,
        );
        yield* registry.send(coordinatorId, { _tag: "Dispatch", instruction } satisfies TheseusMsg);
      }
    }

    if (cmd._tag === "Steer") {
      const guidance = cmd.guidance.trim();
      if (guidance) {
        yield* tui.info(`steer: ${guidance.slice(0, 60)}${guidance.length > 60 ? "…" : ""}`);
        yield* registry.send(coordinatorId, { _tag: "Steer", guidance } satisfies TheseusMsg);
      }
    }
  }
});
