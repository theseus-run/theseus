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
 *   7. Wrap in ToolResult { llmContent }
 */

import { Effect, Schedule } from "effect";
import type { Tool, ToolResult } from "./index.ts";
import { ToolError, type ToolErrorInput, type ToolErrorOutput, type ToolErrorRetriable } from "./index.ts";

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

/** Call a tool: decode → execute → retry retriable → validate → encode → ToolResult. */
export const callTool = <I, O>(
  tool: Tool<I, O>,
  raw: unknown,
): Effect.Effect<ToolResult, ToolError | ToolErrorInput | ToolErrorOutput> =>
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
    Effect.map((llmContent) => ({ llmContent })),
  );
