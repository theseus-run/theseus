/**
 * Tool — namespace barrel for `import * as Tool from "@theseus.run/core/Tool"`
 *
 * The boundary between AI reasoning and the world. Every step of the
 * pipeline (decode, execute, present) is an Effect.
 *
 * Usage:
 *   import * as Tool from "@theseus.run/core/Tool"
 *
 *   const myTool = Tool.define({
 *     name: "readFile",
 *     description: "Read a file by path",
 *     input: Schema.Struct({ path: Schema.String }),
 *     meta: Tool.meta({ mutation: "readonly", capabilities: ["fs.read"] }),
 *     execute: ({ path }) => Effect.tryPromise({
 *       try: () => Bun.file(path).text(),
 *       catch: (e) => new ReadFailed({ path, cause: e }),
 *     }),
 *   })
 *   const result = Tool.call(myTool, rawArgs)
 */

// ---------------------------------------------------------------------------
// Primary types
// ---------------------------------------------------------------------------

export type { Tool, ToolAny as Any, ToolDef as Def } from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Content — multimodal wire format
// ---------------------------------------------------------------------------

export type {
  AudioContent,
  Content,
  ImageContent,
  Presentation,
  ResourceContent,
  TextContent,
} from "./tool/index.ts";
export {
  audio,
  image,
  resource,
  text,
  textPresentation,
} from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Meta — policy metadata
// ---------------------------------------------------------------------------

export type {
  Capability,
  CapabilityRegistry,
  Mutation,
  ToolMeta as Meta,
} from "./tool/index.ts";
export {
  compareMutation,
  meta,
  mutationAtMost,
} from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

export { defineTool as define } from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Toolkit
// ---------------------------------------------------------------------------

export type { Toolkit, ToolRequirements } from "./tool/toolkit.ts";
export {
  emptyToolkit,
  hasCapability,
  hasTool,
  makeToolkit,
  mergeToolkits,
  mutations,
  visibleOnly,
  withCapabilitySubset,
  withMaxMutation,
  withoutCapability,
} from "./tool/toolkit.ts";

// ---------------------------------------------------------------------------
// Execution pipeline
// ---------------------------------------------------------------------------

export { callTool as call } from "./tool/run.ts";

// ---------------------------------------------------------------------------
// Runtime errors (keep prefix — _tag must be globally unique for pattern matching)
// ---------------------------------------------------------------------------

export {
  ToolDefect,
  ToolInputError,
  ToolOutputError,
  type ToolRuntimeError,
} from "./tool/index.ts";
