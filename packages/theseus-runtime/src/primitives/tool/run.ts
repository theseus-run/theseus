/**
 * Tool execution wrappers — decode, execute, retry, validate.
 *
 * callTool: the standard pipeline for calling a tool from the runtime.
 *   1. Decode raw LLM args via inputSchema
 *   2. Execute the tool
 *   3. Retry ToolErrorRetriable (3x, exponential backoff, jittered)
 *   4. Convert exhausted ToolErrorRetriable → ToolError
 *   5. Validate output against outputSchema (if provided)
 *   6. Return raw output (caller serializes when needed)
 */

import { Effect, Schedule } from "effect";
import type { Tool } from "./index.ts";
import { ToolError, ToolErrorInput, ToolErrorOutput, ToolErrorRetriable } from "./index.ts";

// ---------------------------------------------------------------------------
// Default retry schedule — 3 attempts, exponential backoff, jittered
// ---------------------------------------------------------------------------

export const DEFAULT_RETRY_SCHEDULE = Schedule.both(
  Schedule.exponential("200 millis").pipe(Schedule.jittered),
  Schedule.recurs(3),
);

// ---------------------------------------------------------------------------
// callTool — the standard tool execution pipeline
// ---------------------------------------------------------------------------

/** Call a tool: decode input → execute → retry retriable → validate output. */
export const callTool = <I, O>(
  tool: Tool<I, O>,
  raw: unknown,
): Effect.Effect<O, ToolError | ToolErrorInput | ToolErrorOutput> =>
  // 1. Decode input
  Effect.try({
    try: () => tool.inputSchema.decode(raw),
    catch: (cause) =>
      new ToolErrorInput({ tool: tool.name, message: "Invalid input", cause }),
  }).pipe(
    // 2. Execute + retry retriable errors
    Effect.flatMap((input) =>
      Effect.suspend(() => tool.execute(input)).pipe(
        Effect.retry({
          while: (e): e is ToolErrorRetriable =>
            e._tag === "ToolErrorRetriable",
          schedule: DEFAULT_RETRY_SCHEDULE,
        }),
        // 3. Convert exhausted ToolErrorRetriable → ToolError
        Effect.catchTag("ToolErrorRetriable", (e) =>
          Effect.fail(
            new ToolError({ tool: e.tool, message: e.message, cause: e }),
          ),
        ),
      ),
    ),
    // 4. Validate output (if outputSchema provided)
    Effect.flatMap((output) =>
      tool.outputSchema
        ? Effect.try({
            try: () => {
              tool.outputSchema!.decode(output);
              return output;
            },
            catch: (cause) =>
              new ToolErrorOutput({
                tool: tool.name,
                message: "Output validation failed",
                output,
                cause,
              }),
          })
        : Effect.succeed(output),
    ),
  );
