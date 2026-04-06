/**
 * @theseus.run/core — typed primitives for LLM agent systems.
 *
 * Tool, LLM provider interface, Agent types, Dispatch, Grunt.
 */

// Tool — core types, errors, helpers
export {
  ToolError,
  ToolErrorRetriable,
  ToolErrorInput,
  ToolErrorOutput,
  compareToolSafety,
  defineTool,
  defineToolEffect,
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
  ToolDefEffect,
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
  LLMStreamChunk,
  LLMToolCall,
  LLMToolDef,
  LLMUsage,
} from "./llm/index.ts";

// Agent primitives — shared types for all agent strategies
export { AgentError } from "./agent/index.ts";
export type { AgentResult, Blueprint } from "./agent/index.ts";

// Dispatch — LLM dispatch primitive (step, loop, events, injection)
export {
  dispatch,
  dispatchAwait,
  step,
  stepStream,
  extractToolDefs,
  tryParseArgs,
  runToolCall,
  runToolCalls,
  DEFAULT_LLM_RETRY_SCHEDULE,
} from "./dispatch/index.ts";
export type {
  DispatchEvent,
  DispatchHandle,
  Injection,
  StepResult,
  StepText,
  StepToolCalls,
  ToolCallResult,
} from "./dispatch/index.ts";

// Grunt — stateless, ephemeral LLM agent (fire and forget)
export { grunt, gruntAwait } from "./grunt/index.ts";
export type { GruntHandle } from "./grunt/index.ts";
