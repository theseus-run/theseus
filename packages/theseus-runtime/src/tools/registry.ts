/**
 * ToolRegistry — Effect service that holds all registered tools for a session.
 *
 * - `definitions()` returns the JSON schemas sent to the LLM with each request.
 * - `execute(name, args)` dispatches a tool call by name.
 *   Errors from handlers are caught and returned as an error string so the
 *   model can reason about failures rather than crashing the agent loop.
 */
import { Cause, Effect, Layer, ServiceMap } from "effect"
import type { ToolDefinition } from "../llm/copilot.ts"
import type { RegisteredTool, ToolHandler } from "./types.ts"

export class ToolRegistry extends ServiceMap.Service<
  ToolRegistry,
  {
    readonly definitions: () => ReadonlyArray<ToolDefinition>
    readonly execute: (name: string, args: unknown) => Effect.Effect<string, never>
  }
>()("ToolRegistry") {}

/**
 * Build the raw ToolRegistry service value from a plain array of registered tools.
 * Use this inside a Layer.effect that needs to yield other services first
 * (e.g. TsService) before constructing the tool list.
 */
export const buildToolRegistryService = (
  tools: ReadonlyArray<RegisteredTool>,
): typeof ToolRegistry.Service => {
  const byName = new Map<string, ToolHandler>(
    tools.map((t) => [t.definition.function.name, t.handler]),
  )
  const defs = tools.map((t) => t.definition) as ReadonlyArray<ToolDefinition>

  return ToolRegistry.of({
    definitions: () => defs,
    execute: (name, args) => {
      const handler = byName.get(name)
      if (!handler) return Effect.succeed(`Error: unknown tool "${name}"`)
      return handler(args).pipe(
        Effect.catchCause((cause) => Effect.succeed(`Tool error: ${Cause.pretty(cause)}`)),
      )
    },
  })
}

/**
 * Build a ToolRegistry Layer from a plain array of registered tools.
 * Use when the tool list is already fully constructed (no Effect dependencies needed).
 */
export const makeToolRegistryLayer = (
  tools: ReadonlyArray<RegisteredTool>,
): Layer.Layer<ToolRegistry> =>
  Layer.succeed(ToolRegistry)(buildToolRegistryService(tools))
