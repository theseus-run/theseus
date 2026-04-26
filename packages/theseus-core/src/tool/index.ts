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
 *     failure: ReadFailed,
 *     policy: { interaction: "observe" },
 *     execute: ({ path }) =>
 *       Effect.tryPromise({
 *         try: () => Bun.file(path).text(),
 *         catch: (e) => new ReadFailed({ path, cause: e }),
 *       }),
 *   })
 */

import type { Effect, Schedule, Schema } from "effect";
import type { Presentation } from "./content.ts";
import type { ToolPolicy } from "./meta.ts";
import type { ToolValue } from "./run.ts";

type ToolPresenter<O, F, R> = {
  bivarianceHack(value: ToolValue<O, F>): Effect.Effect<Presentation, never, R>;
}["bivarianceHack"];

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
  /** Project the typed success/failure value into LLM/UI content. Defaults to text via JSON. */
  readonly present?: ToolPresenter<O, F, R>;
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
// ToolDef<Input, Output, Failure, R> — author-facing config for defineTool
// ---------------------------------------------------------------------------

export interface ToolDef<
  Input extends Schema.Schema<unknown>,
  Output extends Schema.Schema<unknown>,
  Failure extends Schema.Schema<unknown>,
  R,
> {
  readonly name: string;
  readonly description: string;
  readonly input: Input;
  readonly output: Output;
  readonly failure: Failure;
  readonly policy: ToolPolicy;
  readonly execute: (
    input: Schema.Schema.Type<Input>,
  ) => Effect.Effect<Schema.Schema.Type<Output>, Schema.Schema.Type<Failure>, R>;
  readonly present?: (
    value: ToolValue<Schema.Schema.Type<Output>, Schema.Schema.Type<Failure>>,
  ) => Effect.Effect<Presentation, never, R>;
  readonly retry?: Schedule.Schedule<unknown>;
}

// ---------------------------------------------------------------------------
// defineTool — single constructor
// ---------------------------------------------------------------------------

/**
 * Define a tool. One constructor; all pipeline concerns (decode, encode,
 * validate, retry) are handled by the runtime via the tool's schemas.
 */
export const defineTool = <
  Input extends Schema.Schema<unknown>,
  Output extends Schema.Schema<unknown>,
  Failure extends Schema.Schema<unknown>,
  R = never,
>(
  def: ToolDef<Input, Output, Failure, R>,
): Tool<Schema.Schema.Type<Input>, Schema.Schema.Type<Output>, Schema.Schema.Type<Failure>, R> => ({
  name: def.name,
  description: def.description,
  input: def.input as Schema.Schema<Schema.Schema.Type<Input>>,
  output: def.output as Schema.Schema<Schema.Schema.Type<Output>>,
  failure: def.failure as Schema.Schema<Schema.Schema.Type<Failure>>,
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
export * as Defaults from "./defaults.ts";
export {
  ToolDefect,
  ToolFailureError,
  ToolInputError,
  ToolOutputError,
  type ToolRuntimeError,
} from "./errors.ts";
export type { ToolInteraction, ToolPolicy } from "./meta.ts";
export { ToolOutcome, ToolValue } from "./run.ts";
