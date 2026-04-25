/**
 * Tool — the boundary between AI reasoning and the world.
 *
 * A Tool is a typed Effect wrapped in LLM-facing metadata. Authors declare:
 *   - `input`   — Effect Schema for the parameters the LLM sends
 *   - `output`  — Effect Schema for the value execute returns
 *   - `failure` — Effect Schema for known failure shapes (the LLM sees these)
 *   - `execute` — Effect producing `O`, failing with `F`, requiring services `R`
 *   - `policy`  — ordered world-interaction policy
 *
 * Everything else is optional: `present` to override the default text
 * presentation, `retry` to declare a retry policy, etc.
 *
 *   import { Schema, Effect } from "effect"
 *   import { defineTool } from "@theseus.run/core/Tool"
 *
 *   const readFile = defineTool({
 *     name: "readFile",
 *     description: "Read a file by path",
 *     input: Schema.Struct({ path: Schema.String }),
 *     output: Schema.String,
 *     policy: { interaction: "observe" },
 *     execute: ({ path }) =>
 *       Effect.tryPromise({
 *         try: () => Bun.file(path).text(),
 *         catch: (e) => new ReadFailed({ path, cause: e }),
 *       }),
 *   })
 */

import type { Schedule } from "effect";
import { type Effect, Schema } from "effect";
import type { Presentation } from "./content.ts";
import type { ToolPolicy } from "./meta.ts";

// ---------------------------------------------------------------------------
// Tool<I, O, F, R>
// ---------------------------------------------------------------------------

/**
 * The tool primitive.
 *
 * @typeParam I — decoded input type (what `execute` receives)
 * @typeParam O — success output type (what `execute` returns)
 * @typeParam F — known failure type (typed error channel of `execute`)
 * @typeParam R — Effect service requirements of `execute`
 */
export interface Tool<I, O, F, R> {
  /** Tool name — what the LLM calls. */
  readonly name: string;
  /** Human/LLM-readable description of what this tool does. */
  readonly description: string;
  /** Schema for the parameters the LLM sends. */
  readonly input: Schema.Schema<I>;
  /** Schema for the success value returned by `execute`. */
  readonly output: Schema.Schema<O>;
  /** Schema for known failure shapes. `Schema.Never` means "no known failures". */
  readonly failure: Schema.Schema<F>;
  /** Ordered world-interaction policy. */
  readonly policy: ToolPolicy;
  /** The typed effect. */
  readonly execute: (input: I) => Effect.Effect<O, F, R>;
  /** Convert the typed output into LLM/UI content. Defaults to text via JSON encode. */
  readonly present?: (output: O) => Presentation;
  /** Retry policy for failures. Authors gate by error shape via `Schedule.whileInput` internally. */
  readonly retry?: Schedule.Schedule<unknown>;
}

// ---------------------------------------------------------------------------
// ToolAny — type-erased Tool for collections and runtime code
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: type erasure for heterogeneous tool collections
export type ToolAny = Tool<any, any, any, any>;

// biome-ignore lint/suspicious/noExplicitAny: type erasure that preserves only the service environment
export type ToolAnyWith<R> = Tool<any, any, any, R>;

// ---------------------------------------------------------------------------
// ToolDef<I, O, F, R> — author-facing config for defineTool
//
// `output` and `failure` are optional with sensible defaults:
//   - output  defaults to Schema.String
//   - failure defaults to Schema.Never
// ---------------------------------------------------------------------------

export interface ToolDef<I, O, F, R> {
  readonly name: string;
  readonly description: string;
  readonly input: Schema.Schema<I>;
  readonly output?: Schema.Schema<O>;
  readonly failure?: Schema.Schema<F>;
  readonly policy: ToolPolicy;
  readonly execute: (input: I) => Effect.Effect<O, F, R>;
  readonly present?: (output: O) => Presentation;
  readonly retry?: Schedule.Schedule<unknown>;
}

// ---------------------------------------------------------------------------
// defineTool — single constructor
// ---------------------------------------------------------------------------

/**
 * Define a tool. One constructor; all pipeline concerns (decode, encode,
 * validate, retry) are handled by the runtime via the tool's schemas.
 */
export const defineTool = <I, O = string, F = never, R = never>(
  def: ToolDef<I, O, F, R>,
): Tool<I, O, F, R> => ({
  name: def.name,
  description: def.description,
  input: def.input,
  output: def.output ?? (Schema.String as unknown as Schema.Schema<O>),
  failure: def.failure ?? (Schema.Never as unknown as Schema.Schema<F>),
  policy: def.policy,
  execute: def.execute,
  ...(def.present ? { present: def.present } : {}),
  ...(def.retry ? { retry: def.retry } : {}),
});

// ---------------------------------------------------------------------------
// Re-exports from sibling modules — single-import convenience
// ---------------------------------------------------------------------------

export type {
  AudioContent,
  Content,
  ImageContent,
  Presentation,
  ResourceContent,
  TextContent,
} from "./content.ts";
export {
  audio,
  image,
  resource,
  text,
  textPresentation,
} from "./content.ts";
export {
  ToolDefect,
  ToolInputError,
  ToolOutputError,
  type ToolRuntimeError,
} from "./errors.ts";
export type { ToolInteraction, ToolPolicy } from "./meta.ts";
export { compareInteraction, interactionAtMost } from "./meta.ts";
