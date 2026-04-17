/**
 * Runtime tool errors — produced by the Tool machinery itself, never raised
 * by tool authors.
 *
 * Authors use the tool's typed `Failure` channel for known failures.
 * Unknown thrown errors become `ToolDefect` (Effect.die / rejected promise
 * that wasn't mapped).
 *
 * The three classes here cover the pipeline boundaries:
 *   - input decode failed  → ToolInputError
 *   - output encode failed → ToolOutputError
 *   - unexpected crash     → ToolDefect
 */

import { Data } from "effect";
import type { SchemaError } from "effect/Schema";

/** Raw LLM args did not match the tool's input schema. */
export class ToolInputError extends Data.TaggedError("ToolInputError")<{
  readonly tool: string;
  readonly cause: SchemaError;
}> {
  override get message(): string {
    return `Tool "${this.tool}" received invalid input: ${this.cause.message}`;
  }
}

/** Tool output did not match the declared output schema. */
export class ToolOutputError extends Data.TaggedError("ToolOutputError")<{
  readonly tool: string;
  readonly output: unknown;
  readonly cause: SchemaError;
}> {
  override get message(): string {
    return `Tool "${this.tool}" produced output that failed validation: ${this.cause.message}`;
  }
}

/** Tool execution threw an unexpected error (not in its typed Failure channel). */
export class ToolDefect extends Data.TaggedError("ToolDefect")<{
  readonly tool: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Tool "${this.tool}" crashed unexpectedly`;
  }
}

/** Union of all runtime-produced tool errors. */
export type ToolRuntimeError = ToolInputError | ToolOutputError | ToolDefect;
