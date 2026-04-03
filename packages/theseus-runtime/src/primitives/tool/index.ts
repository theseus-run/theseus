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
 *     retry: "idempotent",
 *     capabilities: ["fs.read"],
 *     tags: ["filesystem"],
 *     execute: ({ path }, { fail }) =>
 *       Effect.tryPromise(() => Bun.file(path).text()).pipe(
 *         Effect.map((content) => ({ content })),
 *         Effect.mapError((e) => fail(`Cannot read: ${path}`, e)),
 *       ),
 *     serialize: (o) => o.content,
 *   })
 */

import { Data, type Effect } from "effect";
import type { Duration } from "effect";

// ---------------------------------------------------------------------------
// Tool errors — flat tagged union, Effect v4 style
//
// Tool authors use: ToolExecutionError, ToolTransientError
// Runtime creates:  ToolInputError, ToolOutputError, ToolDeniedError
// Defects (bugs):   propagate via Effect.die — no special class
// ---------------------------------------------------------------------------

/** The tool ran but the world said no. LLM can react (try different approach). */
export class ToolExecutionError extends Data.TaggedError("ToolExecutionError")<{
  readonly tool: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Transient failure — retriable by the runtime. Rate limit, timeout, network blip. */
export class ToolTransientError extends Data.TaggedError("ToolTransientError")<{
  readonly tool: string;
  readonly message: string;
  readonly retryAfter?: Duration.Input;
  readonly cause?: unknown;
}> {}

/** LLM sent invalid args. Created by callTool, not by tool authors. */
export class ToolInputError extends Data.TaggedError("ToolInputError")<{
  readonly tool: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Output didn't match outputSchema. Created by callTool, not by tool authors. */
export class ToolOutputError extends Data.TaggedError("ToolOutputError")<{
  readonly tool: string;
  readonly message: string;
  readonly output: unknown;
  readonly cause?: unknown;
}> {}

/** Policy blocked execution — terminal, never retry. */
export class ToolDeniedError extends Data.TaggedError("ToolDeniedError")<{
  readonly tool: string;
  readonly message: string;
  readonly reason: "safety" | "permission" | "disabled";
}> {}

/** Union of all expected tool failures. Use Effect.catchTags to handle. */
export type ToolError =
  | ToolExecutionError
  | ToolTransientError
  | ToolInputError
  | ToolOutputError
  | ToolDeniedError;

// ---------------------------------------------------------------------------
// Safety — ordered mutation level
// ---------------------------------------------------------------------------

/** Mutation level — ordered: readonly < write < destructive. */
export type Safety = "readonly" | "write" | "destructive";

const SAFETY_ORDER: Record<Safety, number> = {
  readonly: 0,
  write: 1,
  destructive: 2,
};

/** Compare two safety levels. Returns negative if a < b, 0 if equal, positive if a > b. */
export const compareSafety = (a: Safety, b: Safety): number =>
  SAFETY_ORDER[a] - SAFETY_ORDER[b];

// ---------------------------------------------------------------------------
// Retry — execution retry semantics
// ---------------------------------------------------------------------------

/** Retry behavior — declares tool nature, runtime decides schedule. */
export type Retry = "idempotent" | "retriable" | "once";

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
  /** Create a ToolExecutionError (world said no — LLM can react). */
  readonly fail: (message: string, cause?: unknown) => ToolExecutionError;
  /** Create a ToolTransientError (retriable by runtime). */
  readonly transient: (
    message: string,
    options?: { retryAfter?: Duration.Input; cause?: unknown },
  ) => ToolTransientError;
}

/** Standalone error factory — for use outside defineTool (e.g. in runtime wiring). */
export const toolErrors = (
  tool: string,
): ToolContext => ({
  fail: (message, cause) => new ToolExecutionError({ tool, message, cause }),
  transient: (message, options) =>
    new ToolTransientError({ tool, message, ...options }),
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
  /** Output schema: optional JSON schema + validator. Enables validation + Effect retry. */
  readonly outputSchema?: SchemaAdapter<O>;
  /** Mutation level: readonly < write < destructive. */
  readonly safety: Safety;
  /** Retry behavior: idempotent (free retry) | retriable (with backoff) | once (never). */
  readonly retry: Retry;
  /** Structural capability declarations: "fs.read", "fs.write", "shell.exec", etc. */
  readonly capabilities: ReadonlyArray<string>;
  /** Categorical tags for UI/human grouping: "filesystem", "git", "search", etc. */
  readonly tags: ReadonlyArray<string>;
  /** Execute the tool. Returns ToolExecutionError or ToolTransientError on failure. */
  readonly execute: (input: I) => Effect.Effect<O, ToolExecutionError | ToolTransientError>;
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
  ) => Effect.Effect<O, ToolExecutionError | ToolTransientError>;
};

// ---------------------------------------------------------------------------
// defineTool — construct a Tool with all types inferred
// ---------------------------------------------------------------------------

/** Define a tool. Bridges author's (input, ctx) → runtime's (input) by pre-binding ToolContext. */
export const defineTool = <I, O>(config: ToolDef<I, O>): Tool<I, O> => {
  const ctx = toolErrors(config.name);
  return { ...config, execute: (input) => config.execute(input, ctx) };
};

// ---------------------------------------------------------------------------
// AnyTool — type-erased Tool for collections
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: type erasure for heterogeneous tool collections
export type AnyTool = Tool<any, any>;

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

/** Extract all unique capabilities from an array of tools. */
export const capabilities = (tools: ReadonlyArray<AnyTool>): ReadonlyArray<string> =>
  [...new Set(tools.flatMap((t) => t.capabilities))];

/** Check whether a tool set contains a specific capability. */
export const hasCapability = (tools: ReadonlyArray<AnyTool>, capability: string): boolean =>
  tools.some((t) => t.capabilities.includes(capability));

/** Filter tools to only those without a specific capability. */
export const withoutCapability = (
  tools: ReadonlyArray<AnyTool>,
  capability: string,
): ReadonlyArray<AnyTool> => tools.filter((t) => !t.capabilities.includes(capability));

/** Filter tools by maximum safety level. */
export const withMaxSafety = (
  tools: ReadonlyArray<AnyTool>,
  maxSafety: Safety,
): ReadonlyArray<AnyTool> =>
  tools.filter((t) => compareSafety(t.safety, maxSafety) <= 0);

/** Filter tools by tag. */
export const withTag = (
  tools: ReadonlyArray<AnyTool>,
  tag: string,
): ReadonlyArray<AnyTool> => tools.filter((t) => t.tags.includes(tag));
