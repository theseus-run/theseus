/**
 * callTool — the standard tool execution pipeline.
 *
 *   1. Decode raw LLM args via `tool.input` (Effect Schema)
 *   2. Apply `tool.retry` schedule (if configured) around execution
 *   3. Run `tool.execute`
 *   4. On success → `tool.present(output)` (or default text presentation)
 *   5. On known failure (`F`) → build an error Presentation (isError: true)
 *   6. On defect (unexpected throw) → fail with `ToolDefect`
 *
 * The returned Effect's error channel contains only runtime errors:
 *   - `ToolInputError`  — schema decode failed (LLM sent bad args)
 *   - `ToolDefect`      — tool crashed unexpectedly
 *
 * Typed failures (`F`) are absorbed into the Presentation (`isError: true`,
 * `structured` carries the encoded failure) because the LLM needs to see them
 * as tool-result content, not exceptions. Callers who need F in the error
 * channel can match on `result.isError` or pre-compose around `callTool`.
 */

import { Effect, Schema } from "effect";
import { type Presentation, textPresentation } from "./content.ts";
import { ToolDefect, ToolInputError } from "./errors.ts";
import type { Tool } from "./index.ts";

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

// ---------------------------------------------------------------------------
// callTool
// ---------------------------------------------------------------------------

/**
 * Call a tool: decode → retry-wrapped execute → present.
 * Typed failures are folded into an error `Presentation`; defects propagate.
 */
export const callTool = <I, O, F, R>(
  tool: Tool<I, O, F, R>,
  raw: unknown,
): Effect.Effect<Presentation, ToolInputError | ToolDefect, R> => {
  const present = tool.present ?? (defaultPresent as (o: O) => Presentation);

  // Schema.Schema<I> has unconstrained decoding services at the type level;
  // we cast to keep callTool's R channel clean. In practice the schema is pure.
  const decodeStep: Effect.Effect<I, ToolInputError, never> =
    (
      // biome-ignore lint/suspicious/noExplicitAny: Schema decoding-service type erasure
      Schema.decodeUnknownEffect(tool.input as any)(raw) as Effect.Effect<
        I,
        Schema.SchemaError,
        never
      >
    ).pipe(Effect.mapError((cause) => new ToolInputError({ tool: tool.name, cause })));

  const executeStep = (input: I): Effect.Effect<O, F, R> => {
    const run = tool.execute(input);
    return tool.retry ? Effect.retry(run, tool.retry) : run;
  };

  return decodeStep.pipe(
    Effect.flatMap((input) =>
      executeStep(input).pipe(
        Effect.matchEffect({
          onSuccess: (output) => Effect.succeed(present(output)),
          onFailure: (failure) => Effect.succeed(defaultPresentFailure<F>(failure)),
        }),
      ),
    ),
    Effect.catchDefect((cause) => Effect.fail(new ToolDefect({ tool: tool.name, cause }))),
  );
};
