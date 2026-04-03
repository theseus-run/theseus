/**
 * Tool — the boundary between AI reasoning and the world.
 *
 * All-Effect pipeline: every step (decode, execute, validate, encode)
 * is an Effect on the Tool itself. Spread+override any step.
 *
 * Schema-agnostic: the ToolDef takes a SchemaAdapter (JSON schema + decoder).
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
 *     encode: (o) => o.content,
 *   })
 */

import { Data, Effect } from "effect";

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
export type ToolErrors = ToolError | ToolErrorRetriable | ToolErrorInput | ToolErrorOutput;

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
// Tool<I, O> — runtime-facing interface (all-Effect pipeline)
// ---------------------------------------------------------------------------

export interface Tool<I, O> {
  /** Tool name — what the LLM calls. */
  readonly name: string;
  /** Human/LLM-readable description of what this tool does. */
  readonly description: string;
  /** Input JSON Schema for the LLM. */
  readonly inputSchema: Record<string, unknown>;
  /** Output JSON Schema for the LLM (optional). */
  readonly outputSchema?: Record<string, unknown>;
  /** Mutation level: readonly < write < destructive. */
  readonly safety: ToolSafety;
  /** Structural capability declarations: "fs.read", "fs.write", "shell.exec", etc. */
  readonly capabilities: ReadonlyArray<string>;

  // Pipeline steps — all Effects
  /** Decode raw LLM args into typed input. */
  readonly decode: (raw: unknown) => Effect.Effect<I, ToolErrorInput>;
  /** Execute the tool. Returns ToolError (permanent) or ToolErrorRetriable (retriable). */
  readonly execute: (input: I) => Effect.Effect<O, ToolError | ToolErrorRetriable>;
  /** Validate output shape (optional). */
  readonly validate?: (output: O) => Effect.Effect<O, ToolErrorOutput>;
  /** Encode output to string for the LLM's tool result message. */
  readonly encode: (output: O) => Effect.Effect<string, ToolError>;
}

// ---------------------------------------------------------------------------
// ToolDef<I, O> — author-facing config (ergonomic)
// ---------------------------------------------------------------------------

/** What tool authors pass to defineTool. execute receives (input, ctx). */
export type ToolDef<I, O> = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: SchemaAdapter<I>;
  readonly outputSchema?: SchemaAdapter<O>;
  readonly safety: ToolSafety;
  readonly capabilities: ReadonlyArray<string>;
  readonly execute: (
    input: I,
    ctx: ToolContext,
  ) => Effect.Effect<O, ToolError | ToolErrorRetriable>;
  /** Sync encoder — defineTool wraps in Effect. */
  readonly encode: (output: O) => string;
};

// ---------------------------------------------------------------------------
// defineTool — bridges ToolDef → Tool (all-Effect pipeline)
// ---------------------------------------------------------------------------

/** Define a tool. Bridges author's ergonomic ToolDef into the all-Effect Tool pipeline. */
export const defineTool = <I, O>(def: ToolDef<I, O>): Tool<I, O> => {
  const ctx = toolContext(def.name);
  const base = {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema.json,
    safety: def.safety,
    capabilities: def.capabilities,
    decode: (raw: unknown) =>
      Effect.try({
        try: () => def.inputSchema.decode(raw),
        catch: (cause: unknown) =>
          new ToolErrorInput({ tool: def.name, message: "Invalid input", cause }),
      }),
    execute: (input: I) => def.execute(input, ctx),
    encode: (output: O) =>
      Effect.try({
        try: () => def.encode(output),
        catch: (cause: unknown) =>
          new ToolError({ tool: def.name, message: "Encode failed", cause }),
      }),
  };
  if (def.outputSchema) {
    const os = def.outputSchema;
    return {
      ...base,
      outputSchema: os.json,
      validate: (output: O) =>
        Effect.try({
          try: () => {
            os.decode(output);
            return output;
          },
          catch: (cause: unknown) =>
            new ToolErrorOutput({
              tool: def.name,
              message: "Output validation failed",
              output,
              cause,
            }),
        }),
    };
  }
  return base;
};

// ---------------------------------------------------------------------------
// ToolResult — what callTool returns: separate LLM and display content
//
// llmContent   → goes into message history (what the model reads back)
// displayContent → shown in the UI (defaults to llmContent when absent)
//
// Most tools return the same string for both. Split when output is truncated
// or reformatted for the model but you want the raw content in the UI.
// ---------------------------------------------------------------------------

export interface ToolResult {
  /** The string fed back into the LLM message history. */
  readonly llmContent: string;
  /** What the UI renders. Defaults to llmContent when absent. */
  readonly displayContent?: string;
}

// ---------------------------------------------------------------------------
// ToolAny — type-erased Tool for collections
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: type erasure for heterogeneous tool collections
export type ToolAny = Tool<any, any>;

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

/** Extract all unique capabilities from an array of tools. */
export const toolCapabilities = (tools: ReadonlyArray<ToolAny>): ReadonlyArray<string> => [
  ...new Set(tools.flatMap((t) => t.capabilities)),
];

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
): ReadonlyArray<ToolAny> => tools.filter((t) => compareToolSafety(t.safety, maxSafety) <= 0);
