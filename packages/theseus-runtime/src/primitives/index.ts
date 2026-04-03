/**
 * Theseus primitives — the irreducible building blocks.
 *
 * Five primitives: Mission, Tool, Capsule, Dispatch, RuntimeBus.
 * This module exports Tool (first built). Others will follow.
 */

// Tool — core types, errors, helpers
export {
  ToolError,
  ToolErrorRetriable,
  ToolErrorInput,
  ToolErrorOutput,
  compareToolSafety,
  defineTool,
  manualSchema,
  toolCapabilities,
  toolContext,
  toolHasCapability,
  toolsWithMaxSafety,
  toolsWithoutCapability,
} from "./tool/index.ts";

export type {
  SchemaAdapter,
  Tool,
  ToolAny,
  ToolContext,
  ToolDef,
  ToolErrors,
  ToolResult,
  ToolSafety,
} from "./tool/index.ts";

// Tool — schema adapters
export { fromZod } from "./tool/zod.ts";
export { fromEffectSchema } from "./tool/effect-schema.ts";

// Tool — execution pipeline
export { callTool, DEFAULT_RETRY_SCHEDULE } from "./tool/run.ts";

// LLM provider interface
export { LLMProvider, LLMError, LLMErrorRetriable } from "./llm/index.ts";
export type {
  LLMCallOptions,
  LLMMessage,
  LLMResponse,
  LLMToolCall,
  LLMToolDef,
  LLMUsage,
} from "./llm/index.ts";
