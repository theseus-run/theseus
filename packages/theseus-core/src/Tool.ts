/**
 * Tool — namespace barrel for `import * as Tool from "@theseus.run/core/Tool"`
 *
 * The boundary between AI reasoning and the world. Every step of the
 * pipeline (decode, execute, present) is an Effect.
 *
 * Usage:
 *   import * as Tool from "@theseus.run/core/Tool"
 *
 *   const myTool = Tool.defineTool({
 *     name: "readFile",
 *     description: "Read a file by path",
 *     input: Schema.Struct({ path: Schema.String }),
 *     policy: { interaction: "observe" },
 *     execute: ({ path }) => Effect.tryPromise({
 *       try: () => Bun.file(path).text(),
 *       catch: (e) => new ReadFailed({ path, cause: e }),
 *     }),
 *   })
 *   const result = Tool.callTool(myTool, rawArgs)
 */

// ---------------------------------------------------------------------------
// Primary types
// ---------------------------------------------------------------------------

export type { Tool, ToolAny, ToolAnyWith, ToolDef } from "./tool/index.ts";

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
// Policy — world-interaction metadata
// ---------------------------------------------------------------------------

export type {
  ToolInteraction,
  ToolPolicy,
} from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

export { defineTool } from "./tool/index.ts";

// ---------------------------------------------------------------------------
// Toolkit
// ---------------------------------------------------------------------------

export type { Toolkit, ToolRequirements } from "./tool/toolkit.ts";
export {
  emptyToolkit,
  hasTool,
  interactions,
  makeToolkit,
  mergeToolkits,
} from "./tool/toolkit.ts";

// ---------------------------------------------------------------------------
// Execution pipeline
// ---------------------------------------------------------------------------

export { callTool } from "./tool/run.ts";

// ---------------------------------------------------------------------------
// Runtime errors (keep prefix — _tag must be globally unique for pattern matching)
// ---------------------------------------------------------------------------

export {
  ToolDefect,
  ToolInputError,
  ToolOutputError,
  type ToolRuntimeError,
} from "./tool/index.ts";
