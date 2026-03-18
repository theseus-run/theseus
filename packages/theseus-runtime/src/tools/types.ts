import type { Effect } from "effect"

// Re-export from copilot so callers import from one place
export type { ToolDefinition, LLMToolCall } from "../llm/copilot.ts"

/**
 * A tool handler: receives parsed args, returns a plain string result
 * that is injected back into the conversation as a tool message.
 * Errors are caught by the ToolRegistry and returned as error strings
 * (so the model can reason about failures rather than crashing).
 */
export type ToolHandler = (args: unknown) => Effect.Effect<string, Error>

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
