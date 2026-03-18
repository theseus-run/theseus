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
 * Build a ToolRegistry Layer from a plain array of registered tools.
 * Usage: Layer.provide(makeToolRegistryLayer([readFileTool, ...]))
 */
export const makeToolRegistryLayer = (
  tools: ReadonlyArray<RegisteredTool>,
): Layer.Layer<ToolRegistry> => {
  const byName = new Map<string, ToolHandler>(
    tools.map((t) => [t.definition.function.name, t.handler]),
  )
  const defs = tools.map((t) => t.definition) as ReadonlyArray<ToolDefinition>

  return Layer.succeed(ToolRegistry)(
    ToolRegistry.of({
      definitions: () => defs,
      execute: (name, args) => {
        const handler = byName.get(name)
        if (!handler) return Effect.succeed(`Error: unknown tool "${name}"`)
        return handler(args).pipe(
          Effect.catchCause((cause) => Effect.succeed(`Tool error: ${Cause.pretty(cause)}`)),
        )
      },
    }),
  )
}
