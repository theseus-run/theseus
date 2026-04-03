/**
 * Theseus primitives — the irreducible building blocks.
 *
 * Five primitives: Mission, Tool, Capsule, Dispatch, RuntimeBus.
 * This module exports Tool (first built). Others will follow.
 */
export {
  capabilities,
  compareSafety,
  defineTool,
  hasCapability,
  manualSchema,
  ToolDeniedError,
  ToolExecutionError,
  ToolInputError,
  ToolOutputError,
  ToolTransientError,
  withMaxSafety,
  withoutCapability,
  withTag,
} from "./tool/index.ts";
export type { AnyTool, Retry, Safety, SchemaAdapter, Tool, ToolError } from "./tool/index.ts";
export { fromZod } from "./tool/zod.ts";
export { fromEffectSchema } from "./tool/effect-schema.ts";
