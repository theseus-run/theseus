/**
 * callTool — the standard tool execution pipeline.
 *
 *   1. Decode raw LLM args via `tool.input` (Effect Schema)
 *   2. Apply `tool.retry` schedule (if configured) around execution
 *   3. Run `tool.execute`
 *   4. Validate success output via `tool.output`
 *   5. Validate known failure via `tool.failure`
 *   6. Project the validated value into a Presentation
 *   7. On defect (unexpected throw) → fail with `ToolDefect`
 *
 * The returned Effect's error channel contains only runtime errors:
 *   - `ToolInputError`  — schema decode failed (LLM sent bad args)
 *   - `ToolOutputError` — execute returned a value outside its schema
 *   - `ToolFailureError` — execute failed with a value outside its schema
 *   - `ToolDefect`      — tool crashed unexpectedly
 *
 * Typed failures (`F`) are absorbed into the outcome (`_tag: "Failure"`)
 * with a Presentation marked `isError: true`;
 * `structured` carries the validated failure) because the LLM needs to see them
 * as tool-result content, not exceptions. Callers who need F in the error
 * channel can pre-compose around `callTool`.
 */

import { Effect, Schema } from "effect";
import type { SchemaError } from "effect/Schema";
import { type Presentation, textPresentation } from "./content.ts";
import { ToolDefect, ToolFailureError, ToolInputError, ToolOutputError } from "./errors.ts";
import type { Tool } from "./index.ts";

// ---------------------------------------------------------------------------
// ToolValue / ToolOutcome
// ---------------------------------------------------------------------------

export type ToolValue<O, F> =
  | {
      readonly _tag: "Success";
      readonly output: O;
    }
  | {
      readonly _tag: "Failure";
      readonly failure: F;
    };

export type ToolOutcome<I, O, F> =
  | {
      readonly _tag: "Success";
      readonly input: I;
      readonly output: O;
      readonly presentation: Presentation;
    }
  | {
      readonly _tag: "Failure";
      readonly input: I;
      readonly failure: F;
      readonly presentation: Presentation;
    };

export const ToolValue = {
  success: <O>(output: O): ToolValue<O, never> => ({
    _tag: "Success",
    output,
  }),

  failure: <F>(failure: F): ToolValue<never, F> => ({
    _tag: "Failure",
    failure,
  }),
};

export const ToolOutcome = {
  success: <I, O>(input: I, output: O, presentation: Presentation): ToolOutcome<I, O, never> => ({
    _tag: "Success",
    input,
    output,
    presentation,
  }),

  failure: <I, F>(input: I, failure: F, presentation: Presentation): ToolOutcome<I, never, F> => ({
    _tag: "Failure",
    input,
    failure,
    presentation,
  }),
};

// ---------------------------------------------------------------------------
// Default presenters
// ---------------------------------------------------------------------------

/** Stringify a value for LLM consumption. Strings pass through; other shapes are JSON. */
const stringify = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

/** Default success presentation: text content built from the output value. */
const defaultPresent = <O>(output: O): Presentation =>
  textPresentation(stringify(output), { structured: output });

/** Default failure presentation: error-flagged text with the failure value as structured data. */
const defaultPresentFailure = <F>(failure: F): Presentation =>
  textPresentation(stringify(failure), { isError: true, structured: failure });

const defaultPresentValue = <O, F>(value: ToolValue<O, F>): Presentation =>
  value._tag === "Success" ? defaultPresent(value.output) : defaultPresentFailure(value.failure);

// ---------------------------------------------------------------------------
// Schema boundary helpers
// ---------------------------------------------------------------------------

const decodeSchema = <A, E>(
  schema: Schema.Schema<A>,
  value: unknown,
  mapError: (cause: SchemaError) => E,
): Effect.Effect<A, E> =>
  // Effect Schema carries no runtime dependency for these tool schemas. Keep
  // the narrowing in one place so callTool remains about the execution flow.
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(mapError)) as Effect.Effect<
    A,
    E,
    never
  >;

const decodeInput = <I, O, F, R>(tool: Tool<I, O, F, R>, raw: unknown) =>
  decodeSchema(tool.input, raw, (cause) => new ToolInputError({ tool: tool.name, cause }));

const validateOutput = <I, O, F, R>(tool: Tool<I, O, F, R>, output: O) =>
  decodeSchema(
    tool.output,
    output,
    (cause) => new ToolOutputError({ tool: tool.name, output, cause }),
  );

const validateFailure = <I, O, F, R>(tool: Tool<I, O, F, R>, failure: F) =>
  decodeSchema(
    tool.failure,
    failure,
    (cause) => new ToolFailureError({ tool: tool.name, failure, cause }),
  );

// ---------------------------------------------------------------------------
// callTool
// ---------------------------------------------------------------------------

/**
 * Call a tool: decode → retry-wrapped execute → validate → present.
 * Typed failures are folded into an error `Presentation`; defects propagate.
 */
export const callTool = <I, O, F, R>(
  tool: Tool<I, O, F, R>,
  raw: unknown,
): Effect.Effect<
  ToolOutcome<I, O, F>,
  ToolInputError | ToolOutputError | ToolFailureError | ToolDefect,
  R
> => {
  const present = (value: ToolValue<O, F>): Effect.Effect<Presentation, never, R> =>
    tool.present ? tool.present(value) : Effect.succeed(defaultPresentValue(value));

  const decodeStep = decodeInput(tool, raw);

  const executeStep = (input: I): Effect.Effect<O, F, R> => {
    const run = tool.execute(input);
    return tool.retry ? Effect.retry(run, tool.retry) : run;
  };

  return decodeStep.pipe(
    Effect.flatMap((input) =>
      executeStep(input).pipe(
        Effect.matchEffect({
          onSuccess: (output) =>
            validateOutput(tool, output).pipe(
              Effect.flatMap((validated) =>
                present(ToolValue.success(validated)).pipe(
                  Effect.map((presentation) => ToolOutcome.success(input, validated, presentation)),
                ),
              ),
            ),
          onFailure: (failure) =>
            validateFailure(tool, failure).pipe(
              Effect.flatMap((validated) =>
                present(ToolValue.failure(validated)).pipe(
                  Effect.map((presentation) => ToolOutcome.failure(input, validated, presentation)),
                ),
              ),
            ),
        }),
      ),
    ),
    Effect.catchDefect((cause) => Effect.fail(new ToolDefect({ tool: tool.name, cause }))),
  );
};
