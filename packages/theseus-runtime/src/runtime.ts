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
import {
  TsService,
  makeTsServiceLayer,
  makeTsTools,
  makeFsTools,
  makeShellTool,
  ToolRegistry,
} from "./tools/index.ts"
import { Queue } from "effect"

// ---------------------------------------------------------------------------
// Workspace root — where tsconfig.json lives for the runtime package
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "")

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
    const byName = new Map(allTools.map((t) => [t.definition.function.name, t.handler]))
    const defs = allTools.map((t) => t.definition) as ReadonlyArray<ToolDefinition>
    return ToolRegistry.of({
      definitions: () => defs,
      execute: (name, args) => {
        const handler = byName.get(name)
        if (!handler)
          return Effect.succeed(`Error: unknown tool "${name}"`)
        return handler(args).pipe(
          Effect.catchCause((cause) => Effect.succeed(`Tool error: ${Cause.pretty(cause)}`)),
        )
      },
    })
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

  // Wrap copilot.chat — errors become content so the agent loop never crashes
  const callLLM = (
    messages: ReadonlyArray<ChatMessage>,
    tools: ReadonlyArray<ToolDefinition>,
  ) =>
    copilot.chat(messages, { model: "gpt-4o", tools }).pipe(
      Effect.catchCause((cause) => {
        const msg = Cause.pretty(cause)
        return Effect.succeed({
          content: `[LLM error: ${msg}]`,
          model: "unknown",
          finishReason: "stop" as const,
          toolCalls: [] as const,
          usage: { promptTokens: 0, completionTokens: 0 },
        })
      }),
    )

  const coordinator = new CoordinatorAgent(callLLM)
  yield* registry.spawn(coordinator)

  yield* Queue.offer(coordinator._inbox, { _tag: "Start" })

  yield* tui.info("scenario running  (Ctrl-C to stop)")
  yield* Effect.never
})
