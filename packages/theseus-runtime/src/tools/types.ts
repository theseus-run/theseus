import type { Effect } from "effect"

// Re-export from copilot so callers import from one place
export type { ToolDefinition, LLMToolCall } from "../llm/copilot.ts"

/**
 * A tool handler: receives parsed args, returns a plain string result
 * that is injected back into the conversation as a tool message.
 * Handlers are fully responsible for converting all errors to informative
 * strings — the handler must never fail (Effect<string, never>).
 */
export type ToolHandler = (args: unknown) => Effect.Effect<string, never>

/**
 * A registered tool: its JSON schema definition (sent to the LLM so it
 * knows how to call it) paired with its execution handler.
 */
export interface RegisteredTool {
  readonly definition: {
    readonly type: "function"
    readonly function: {
      readonly name: string
      readonly description: string
      readonly parameters: {
        readonly type: "object"
        readonly properties: Record<string, unknown>
        readonly required: ReadonlyArray<string>
      }
    }
  }
  readonly handler: ToolHandler
}
