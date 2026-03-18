/**
 * Runtime — composes all layers and exports the main program.
 *
 * Layer dependency graph:
 *
 *   TuiLoggerLive         ──────────────────────────────────────┐
 *   MessageBusLive        ───────────────────────────────────┐  │
 *   AgentRegistryLive     ← requires TuiLogger + MessageBus  │  │
 *   CopilotProviderLive   ← owns its own BunHttpClient       │  │
 *   TsServiceLive         ← initialised from workspace root  │  │
 *   ToolRegistryLive      ← built from fs + shell + ts tools │  │
 *   AppLayer              = all of the above merged           ┘  ┘
 */
import { Cause, Effect, Layer } from "effect"
import { AgentRegistry, AgentRegistryLive } from "./registry.ts"
import { MessageBusLive } from "./bus.ts"
import { TuiLogger, TuiLoggerLive } from "./tui.ts"
import { CopilotProvider, CopilotProviderLive } from "./llm/index.ts"
import type { ChatMessage, ToolDefinition } from "./llm/index.ts"
import { CoordinatorAgent } from "./agents/coordinator.ts"
import type { CoordinatorMsg } from "./agents/coordinator.ts"
import {
  TsService,
  makeTsServiceLayer,
  makeTsTools,
  makeFsTools,
  makeShellTool,
  ToolRegistry,
  buildToolRegistryService,
} from "./tools/index.ts"
import { Config } from "./config.ts"

// ---------------------------------------------------------------------------
// Workspace root — where tsconfig.json lives for the runtime package
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "")

// ---------------------------------------------------------------------------
// TS Language Service layer (initialised once, warm for the session)
// ---------------------------------------------------------------------------

const TsServiceLive = makeTsServiceLayer(WORKSPACE_ROOT)

// ---------------------------------------------------------------------------
// Tool Registry layer — built after TsService is available
// ---------------------------------------------------------------------------

const ToolRegistryLive = Layer.effect(ToolRegistry)(
  Effect.gen(function* () {
    const { languageService } = yield* TsService
    const allTools = [
      ...makeFsTools(WORKSPACE_ROOT),
      makeShellTool(WORKSPACE_ROOT),
      ...makeTsTools(WORKSPACE_ROOT, languageService),
    ]
    return buildToolRegistryService(allTools)
  }),
).pipe(Layer.provide(TsServiceLive))

// ---------------------------------------------------------------------------
// Layer composition
// ---------------------------------------------------------------------------

export const RuntimeLayer = AgentRegistryLive.pipe(
  Layer.provide(Layer.merge(TuiLoggerLive, MessageBusLive)),
)

export const AppLayer = Layer.mergeAll(
  RuntimeLayer,
  TuiLoggerLive,
  CopilotProviderLive,
  TsServiceLive,
  ToolRegistryLive,
)

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

export const main = Effect.gen(function* () {
  const tui = yield* TuiLogger
  const registry = yield* AgentRegistry
  const copilot = yield* CopilotProvider

  yield* tui.info("theseus runtime starting…")
  yield* tui.info(`workspace: ${WORKSPACE_ROOT}`)

  // Wrap copilot.chat — timeout + errors become content so the agent loop never crashes
  const callLLM = (
    messages: ReadonlyArray<ChatMessage>,
    tools: ReadonlyArray<ToolDefinition>,
  ) =>
    copilot.chat(messages, { model: Config.model, tools }).pipe(
      Effect.timeout("120 seconds"),
      Effect.catchCause((cause) => {
        const msg = Cause.pretty(cause)
        return Effect.succeed({
          content: `[LLM error: ${msg}]`,
          model: "unknown",
          // "error" is a sentinel — persistent-agent will log this and NOT append it
          // to conversationHistory, preventing poisoning of future LLM calls.
          finishReason: "error" as const,
          toolCalls: [] as const,
          usage: { promptTokens: 0, completionTokens: 0 },
        })
      }),
    )

  const coordinator = new CoordinatorAgent(callLLM)
  const coordinatorId = coordinator.id
  yield* registry.spawn(coordinator)

  yield* registry.send(coordinatorId, { _tag: "Start" } satisfies CoordinatorMsg)

  // Read tasks from stdin — one instruction per line.
  // This lets the runtime be driven by: echo "fix X" | bun run start
  // or interactively (pipe into the process).
  yield* Effect.forkDetach(
    Effect.gen(function* () {
      const reader = Bun.stdin.stream().getReader()
      const decoder = new TextDecoder()
      let leftover = ""
      while (true) {
        const chunk = yield* Effect.tryPromise({
          try: () => reader.read() as Promise<{ done: boolean; value: Uint8Array | undefined }>,
          catch: () => new Error("stdin read failed"),
        }).pipe(Effect.catchCause(() => Effect.succeed({ done: true as const, value: undefined })))
        if (chunk.done) break
        leftover += decoder.decode(chunk.value, { stream: true })
        const lines = leftover.split("\n")
        leftover = lines.pop() ?? ""
        for (const line of lines) {
          if (line.trim()) {
            yield* tui.info(`stdin → dispatch: ${line.trim().slice(0, 60)}${line.trim().length > 60 ? "…" : ""}`)
            yield* registry.send(coordinatorId, { _tag: "Dispatch", instruction: line.trim() } satisfies CoordinatorMsg)
          }
        }
      }
    }) as Effect.Effect<void, never, never>,
  )

  yield* tui.info("ready — pipe tasks via stdin (one instruction per line)")
  yield* Effect.never
})
