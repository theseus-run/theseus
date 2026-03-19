/**
 * LLM barrel — re-exports the CopilotProvider service and shared types.
 *
 * The indirection allows swapping providers without touching agent code:
 * agents depend on the `ChatMessage` / `ChatResponse` types and a
 * `callLLM` function with the same signature, regardless of backend.
 */

export type { ChatMessage, ChatResponse, LLMToolCall, ToolDefinition } from "./copilot.ts";
export { CopilotProvider, CopilotProviderLive } from "./copilot.ts";
