/**
 * Tool — namespace barrel for `import * as Tool from "@theseus.run/core/Tool"`
 *
 * The boundary between AI reasoning and the world. All-Effect pipeline:
 * every step (decode, execute, validate, encode) is an Effect.
 *
 * Usage:
 *   import * as Tool from "@theseus.run/core/Tool"
 *
 *   const myTool: Tool.Tool<Input, string> = Tool.define({ ... })
 *   const result = Tool.call(myTool, rawArgs)
 */

// ---------------------------------------------------------------------------
// Primary type
// ---------------------------------------------------------------------------

export type { Tool } from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Secondary types (short aliases — namespaced by `Tool.*`)
// ---------------------------------------------------------------------------

export type {
  SchemaAdapter,
  ToolAny as Any,
  ToolContext as Context,
  ToolDef as Def,
  ToolDefEffect as DefEffect,
  ToolErrors as Errors,
  ToolResult as Result,
  ToolSafety as Safety,
} from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Functions (drop module prefix — namespace provides it)
// ---------------------------------------------------------------------------

export {
  compareToolSafety as compareSafety,
  defineTool as define,
  defineToolEffect as defineEffect,
  manualSchema,
  toolCapabilities as capabilities,
  toolContext as context,
  toolHasCapability as hasCapability,
  toolsWithMaxSafety as withMaxSafety,
  toolsWithoutCapability as withoutCapability,
} from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Schema adapters
// ---------------------------------------------------------------------------

export { fromEffectSchema } from "./tool/effect-schema.ts";
export { fromZod } from "./tool/zod.ts";

// ---------------------------------------------------------------------------
// Execution pipeline
// ---------------------------------------------------------------------------

export { callTool as call, DEFAULT_RETRY_SCHEDULE } from "./tool/run.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix — _tag must be globally unique for pattern matching)
// ---------------------------------------------------------------------------

export { ToolError, ToolErrorInput, ToolErrorOutput, ToolErrorRetriable } from "./tool/index.ts";
