/**
 * @theseus.run/core — typed primitives for LLM agent systems.
 *
 * Tool, Agent types, Dispatch, Grunt.
 * LLM provider interface is effect/unstable/ai/LanguageModel (not re-exported).
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

// Agent primitives — shared types for all agent strategies
export { AgentError } from "./agent/index.ts";
export type { AgentResult, Blueprint } from "./agent/index.ts";

// Dispatch — LLM dispatch primitive (step, loop, events, injection)
export {
  dispatch,
  dispatchAwait,
  step,
  stepStream,
  tryParseArgs,
  runToolCall,
  runToolCalls,
} from "./dispatch/index.ts";
export type {
  DispatchEvent,
  DispatchHandle,
  Injection,
  Message,
  StepResult,
  StepText,
  StepToolCalls,
  StreamDelta,
  ToolCall,
  ToolCallResult,
  Usage,
} from "./dispatch/index.ts";

// Grunt — stateless, ephemeral LLM agent (fire and forget)
export { grunt, gruntAwait } from "./grunt/index.ts";
export type { GruntHandle } from "./grunt/index.ts";

// Bridge — adapters for effect/unstable/ai interop
export { llmMessagesToPrompt } from "./bridge/to-prompt.ts";
export { responsePartsToStepResult } from "./bridge/from-response.ts";
export { theseusToolToAiTool, theseusToolsToToolkit, extractToolDefs } from "./bridge/to-ai-tools.ts";
