/**
 * Tool — the boundary between AI reasoning and the world.
 *
 * Schema-agnostic: the Tool takes a SchemaAdapter (JSON schema + decoder).
 * Use fromZod, fromEffectSchema, or hand-roll with manualSchema.
 *
 * Usage:
 *   const readFile = defineTool({
 *     name: "readFile",
 *     description: "Read a file by path",
 *     inputSchema: fromZod(z.object({ path: z.string() })),
 *     outputSchema: fromZod(z.object({ content: z.string() })),
 *     safety: "readonly",
 *     capabilities: ["fs.read"],
 *     execute: ({ path }, { fail }) =>
 *       Effect.tryPromise(() => Bun.file(path).text()).pipe(
 *         Effect.map((content) => ({ content })),
 *         Effect.mapError((e) => fail(`Cannot read: ${path}`, e)),
 *       ),
 *     serialize: (o) => o.content,
 *   })
 */

import { Data, type Effect } from "effect";

// ---------------------------------------------------------------------------
// Tool errors — flat tagged union, Effect v4 style
//
// Tool authors use: ToolError (permanent), ToolErrorRetriable (retriable)
// Runtime creates:  ToolErrorInput, ToolErrorOutput
// Defects (bugs):   propagate via Effect.die — no special class
// ---------------------------------------------------------------------------

/** Permanent failure — LLM sees this and reacts (try different approach). */
export class ToolError extends Data.TaggedError("ToolError")<{
  readonly tool: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Retriable failure — runtime retries silently. Rate limit, network blip, timeout. */
export class ToolErrorRetriable extends Data.TaggedError("ToolErrorRetriable")<{
  readonly tool: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** LLM sent invalid args. Created by callTool, not by tool authors. */
export class ToolErrorInput extends Data.TaggedError("ToolErrorInput")<{
  readonly tool: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Output didn't match outputSchema. Created by callTool, not by tool authors. */
export class ToolErrorOutput extends Data.TaggedError("ToolErrorOutput")<{
  readonly tool: string;
  readonly message: string;
  readonly output: unknown;
  readonly cause?: unknown;
}> {}

/** Union of all tool errors. Use Effect.catchTags to handle. */
export type ToolErrors =
  | ToolError
  | ToolErrorRetriable
  | ToolErrorInput
  | ToolErrorOutput;

// ---------------------------------------------------------------------------
// ToolSafety — ordered mutation level
// ---------------------------------------------------------------------------

/** Mutation level — ordered: readonly < write < destructive. */
export type ToolSafety = "readonly" | "write" | "destructive";

const SAFETY_ORDER: Record<ToolSafety, number> = {
  readonly: 0,
  write: 1,
  destructive: 2,
};

/** Compare two safety levels. Negative if a < b, 0 if equal, positive if a > b. */
export const compareToolSafety = (a: ToolSafety, b: ToolSafety): number =>
  SAFETY_ORDER[a] - SAFETY_ORDER[b];

// ---------------------------------------------------------------------------
// SchemaAdapter<T> — typed contract between schema libs and Tool
// ---------------------------------------------------------------------------

export interface SchemaAdapter<T> {
  /** JSON Schema document describing T. */
  readonly json: Record<string, unknown>;
  /** Decode/validate raw data into T. Throws on invalid. */
  readonly decode: (raw: unknown) => T;
}

/** Build a hand-rolled SchemaAdapter from a plain JSON schema and decode function. */
export const manualSchema = <T>(
  json: Record<string, unknown>,
  decode: (raw: unknown) => T,
): SchemaAdapter<T> => ({ json, decode });

// ---------------------------------------------------------------------------
// ToolContext — pre-bound error factories for tool authors
// ---------------------------------------------------------------------------

/** Error factories pre-bound to the tool name. Passed as second arg to execute. */
export interface ToolContext {
  /** Create a ToolError (permanent — LLM sees this). */
  readonly fail: (message: string, cause?: unknown) => ToolError;
  /** Create a ToolErrorRetriable (retriable — runtime retries silently). */
  readonly retriable: (message: string, cause?: unknown) => ToolErrorRetriable;
}

/** Create a ToolContext with error factories pre-bound to the given tool name. */
export const toolContext = (tool: string): ToolContext => ({
  fail: (message, cause) => new ToolError({ tool, message, cause }),
  retriable: (message, cause) => new ToolErrorRetriable({ tool, message, cause }),
});

// ---------------------------------------------------------------------------
// Tool<I, O> — runtime-facing interface (execute takes input only)
// ---------------------------------------------------------------------------

export interface Tool<I, O> {
  /** Tool name — what the LLM calls. */
  readonly name: string;
  /** Human/LLM-readable description of what this tool does. */
  readonly description: string;
  /** Input schema: JSON schema + decoder for LLM args. */
  readonly inputSchema: SchemaAdapter<I>;
  /** Output schema: optional JSON schema + validator for runtime validation. */
  readonly outputSchema?: SchemaAdapter<O>;
  /** Mutation level: readonly < write < destructive. */
  readonly safety: ToolSafety;
  /** Structural capability declarations: "fs.read", "fs.write", "shell.exec", etc. */
  readonly capabilities: ReadonlyArray<string>;
  /** Execute the tool. Returns ToolError (permanent) or ToolErrorRetriable (retriable). */
  readonly execute: (input: I) => Effect.Effect<O, ToolError | ToolErrorRetriable>;
  /** Serialize output to string for the LLM's tool result message. */
  readonly serialize: (output: O) => string;
}

// ---------------------------------------------------------------------------
// ToolDef<I, O> — author-facing config (execute receives ToolContext)
// ---------------------------------------------------------------------------

/** What tool authors pass to defineTool. execute receives (input, ctx). */
export type ToolDef<I, O> = Omit<Tool<I, O>, "execute"> & {
  readonly execute: (
    input: I,
    ctx: ToolContext,
  ) => Effect.Effect<O, ToolError | ToolErrorRetriable>;
};

// ---------------------------------------------------------------------------
// defineTool — construct a Tool with all types inferred
// ---------------------------------------------------------------------------

/** Define a tool. Bridges author's (input, ctx) → runtime's (input) by pre-binding ToolContext. */
export const defineTool = <I, O>(config: ToolDef<I, O>): Tool<I, O> => {
  const ctx = toolContext(config.name);
  return { ...config, execute: (input) => config.execute(input, ctx) };
};

// ---------------------------------------------------------------------------
// ToolAny — type-erased Tool for collections
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: type erasure for heterogeneous tool collections
export type ToolAny = Tool<any, any>;

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

/** Extract all unique capabilities from an array of tools. */
export const toolCapabilities = (tools: ReadonlyArray<ToolAny>): ReadonlyArray<string> =>
  [...new Set(tools.flatMap((t) => t.capabilities))];

/** Check whether a tool set contains a specific capability. */
export const toolHasCapability = (tools: ReadonlyArray<ToolAny>, capability: string): boolean =>
  tools.some((t) => t.capabilities.includes(capability));

/** Filter tools to only those without a specific capability. */
export const toolsWithoutCapability = (
  tools: ReadonlyArray<ToolAny>,
  capability: string,
): ReadonlyArray<ToolAny> => tools.filter((t) => !t.capabilities.includes(capability));

/** Filter tools by maximum safety level. */
export const toolsWithMaxSafety = (
  tools: ReadonlyArray<ToolAny>,
  maxSafety: ToolSafety,
): ReadonlyArray<ToolAny> =>
  tools.filter((t) => compareToolSafety(t.safety, maxSafety) <= 0);
