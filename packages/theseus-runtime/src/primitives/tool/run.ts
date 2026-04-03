/**
 * Tool execution pipeline — decode, execute, retry, validate, encode.
 *
 * callTool: the standard pipeline for calling a tool from the runtime.
 *   1. Decode raw LLM args via tool.decode
 *   2. Execute the tool
 *   3. Retry ToolErrorRetriable (3x, exponential backoff, jittered)
 *   4. Convert exhausted ToolErrorRetriable → ToolError
 *   5. Validate output via tool.validate (if provided)
 *   6. Encode output to string via tool.encode
 */

import { Effect, Schedule } from "effect";
import type { Tool } from "./index.ts";
import { ToolError, type ToolErrorRetriable } from "./index.ts";

// ---------------------------------------------------------------------------
// Default retry schedule — 3 attempts, exponential backoff, jittered
// ---------------------------------------------------------------------------

export const DEFAULT_RETRY_SCHEDULE = Schedule.both(
  Schedule.exponential("200 millis").pipe(Schedule.jittered),
  Schedule.recurs(3),
);

// ---------------------------------------------------------------------------
// callTool — the standard tool execution pipeline (returns string)
// ---------------------------------------------------------------------------

/** Call a tool: decode → execute → retry retriable → validate → encode → string. */
export const callTool = <I, O>(
  tool: Tool<I, O>,
  raw: unknown,
): Effect.Effect<string, ToolError | ToolErrorInput | ToolErrorOutput> =>
  tool.decode(raw).pipe(
    Effect.flatMap((input) =>
      Effect.suspend(() => tool.execute(input)).pipe(
        Effect.retry({
          while: (e): e is ToolErrorRetriable => e._tag === "ToolErrorRetriable",
          schedule: DEFAULT_RETRY_SCHEDULE,
        }),
        Effect.catchTag("ToolErrorRetriable", (e) =>
          Effect.fail(new ToolError({ tool: e.tool, message: e.message, cause: e })),
        ),
      ),
    ),
    Effect.flatMap((output) => (tool.validate ? tool.validate(output) : Effect.succeed(output))),
    Effect.flatMap(tool.encode),
  );

// Re-export error types used in the return type
import type { ToolErrorInput, ToolErrorOutput } from "./index.ts";
