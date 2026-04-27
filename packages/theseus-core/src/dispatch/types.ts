/**
 * Dispatch types — observable events, injection, handle, and step results.
 *
 * Messages use Prompt.MessageEncoded from effect/unstable/ai directly.
 */

import type { Effect, Stream } from "effect";
import { Data, Schema } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type {
  Presentation,
  ToolAnyWith,
  ToolDefect,
  ToolFailureError,
  ToolInputError,
  ToolOutcome,
  ToolOutputError,
} from "../tool/index.ts";
import type { ModelRequest } from "./model-gateway.ts";

// ---------------------------------------------------------------------------
// DispatchSpec — raw dispatch configuration
// ---------------------------------------------------------------------------

export interface DispatchSpec<R = never> {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<ToolAnyWith<R>>;
  readonly maxIterations?: number;
  readonly modelRequest?: ModelRequest;
}

// ---------------------------------------------------------------------------
// Usage — simple token counts for accumulation across iterations
// ---------------------------------------------------------------------------

export const UsageSchema = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
});

export type Usage = Schema.Schema.Type<typeof UsageSchema>;

// ---------------------------------------------------------------------------
// DispatchOutput — raw operational success from the loop
// ---------------------------------------------------------------------------

export const DispatchOutputSchema = Schema.Struct({
  dispatchId: Schema.String,
  name: Schema.String,
  content: Schema.String,
  messages: Schema.Array(Schema.Unknown),
  usage: UsageSchema,
});

export type DispatchOutput = Omit<Schema.Schema.Type<typeof DispatchOutputSchema>, "messages"> & {
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
};

// ---------------------------------------------------------------------------
// DispatchError — raw operational failures from the loop
// ---------------------------------------------------------------------------

/** Dispatch was interrupted via injection, satellite abort, or fiber interrupt. */
export class DispatchInterrupted extends Data.TaggedError("DispatchInterrupted")<{
  readonly dispatchId: string;
  readonly name: string;
  readonly reason?: string;
}> {}

/** Dispatch exceeded its iteration cap. */
export class DispatchCycleExceeded extends Data.TaggedError("DispatchCycleExceeded")<{
  readonly dispatchId: string;
  readonly name: string;
  readonly max: number;
  readonly usage: Usage;
}> {}

/** LLM call failed with a provider/framework error. */
export class DispatchModelFailed extends Data.TaggedError("DispatchModelFailed")<{
  readonly dispatchId: string;
  readonly name: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Tool execution failed and no satellite recovered it. */
export class DispatchToolFailed extends Data.TaggedError("DispatchToolFailed")<{
  readonly dispatchId: string;
  readonly name: string;
  readonly tool: string;
  readonly error: ToolCallError;
}> {}

/** Union of dispatch-level failures. */
export type DispatchError =
  | DispatchInterrupted
  | DispatchCycleExceeded
  | DispatchModelFailed
  | DispatchToolFailed;

// ---------------------------------------------------------------------------
// ToolCall — what the model emitted (decoded from Response.ToolCallPartEncoded)
// ---------------------------------------------------------------------------

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

// ---------------------------------------------------------------------------
// ToolCallResult — parsed result of a single tool call execution
//
// `presentation` carries the full typed Presentation (multimodal content,
// isError flag, optional structured payload). `textContent` is a text-only
// projection for UI events and message round-tripping.
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  readonly callId: string;
  readonly name: string;
  readonly args: unknown;
  readonly outcome?: ToolOutcome<unknown, unknown, unknown>;
  readonly presentation: Presentation;
  readonly textContent: string;
}

// ---------------------------------------------------------------------------
// ToolCallError — typed failures during tool dispatch (not covered by Presentation)
// ---------------------------------------------------------------------------

/** Tool not found in the dispatch spec's toolkit. */
export class ToolCallUnknown extends Data.TaggedError("ToolCallUnknown")<{
  readonly callId: string;
  readonly name: string;
}> {}

/** Arguments failed JSON.parse — model produced malformed tool-call args. */
export class ToolCallBadArgs extends Data.TaggedError("ToolCallBadArgs")<{
  readonly callId: string;
  readonly name: string;
  readonly raw: string;
}> {}

/**
 * Tool dispatch failed with a runtime error (bad input schema or defect).
 * Tool-author failures (F) are folded into the Presentation and do not surface here.
 */
export class ToolCallFailed extends Data.TaggedError("ToolCallFailed")<{
  readonly callId: string;
  readonly name: string;
  readonly args: unknown;
  readonly cause: ToolInputError | ToolOutputError | ToolFailureError | ToolDefect;
}> {}

/** Union of all tool-dispatch errors. */
export type ToolCallError = ToolCallUnknown | ToolCallBadArgs | ToolCallFailed;

// ---------------------------------------------------------------------------
// StepResult — outcome of a single LLM call (no tool execution)
// ---------------------------------------------------------------------------

export interface StepResult {
  readonly content: string;
  readonly thinking?: string;
  readonly toolCalls: ReadonlyArray<ToolCall>;
  readonly usage: Usage;
}

// ---------------------------------------------------------------------------
// DispatchEvent — observable state transitions of the dispatch loop
// ---------------------------------------------------------------------------

export type DispatchEvent =
  | { readonly _tag: "Calling"; readonly name: string; readonly iteration: number }
  | {
      readonly _tag: "Text";
      readonly name: string;
      readonly iteration: number;
      readonly content: string;
    }
  | {
      readonly _tag: "Thinking";
      readonly name: string;
      readonly iteration: number;
      readonly content: string;
    }
  | {
      readonly _tag: "ToolCalling";
      readonly name: string;
      readonly iteration: number;
      readonly tool: string;
      readonly args: unknown;
    }
  | {
      readonly _tag: "ToolResult";
      readonly name: string;
      readonly iteration: number;
      readonly tool: string;
      readonly content: string;
      readonly isError: boolean;
    }
  | {
      readonly _tag: "ToolError";
      readonly name: string;
      readonly iteration: number;
      readonly tool: string;
      readonly error: ToolCallError;
    }
  | {
      readonly _tag: "SatelliteAction";
      readonly name: string;
      readonly iteration: number;
      readonly satellite: string;
      readonly phase: string;
      readonly action: string;
    }
  | {
      readonly _tag: "Injected";
      readonly name: string;
      readonly iteration: number;
      readonly injection: string;
      readonly detail?: string;
    }
  | { readonly _tag: "Done"; readonly name: string; readonly result: DispatchOutput }
  | { readonly _tag: "Failed"; readonly name: string; readonly reason: string };

// ---------------------------------------------------------------------------
// Injection — loop mutations pushed from outside
// ---------------------------------------------------------------------------

export type Injection =
  | { readonly _tag: "AppendMessages"; readonly messages: ReadonlyArray<Prompt.MessageEncoded> }
  | { readonly _tag: "ReplaceMessages"; readonly messages: ReadonlyArray<Prompt.MessageEncoded> }
  | { readonly _tag: "CollapseContext" }
  | { readonly _tag: "Interrupt"; readonly reason?: string }
  | { readonly _tag: "Redirect"; readonly task: string };

// ---------------------------------------------------------------------------
// DispatchOptions — optional configuration for dispatch
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  /** Dispatch identifier for logging/restore. Auto-generated if omitted. */
  readonly dispatchId?: string;
  /** Link to parent dispatch (for dispatch tree tracing). */
  readonly parentDispatchId?: string;
  /** Restore from a previous session — replaces the default [system, user] messages. */
  readonly messages?: ReadonlyArray<Prompt.MessageEncoded>;
  /** Resume iteration count (for usage tracking continuity). */
  readonly iteration?: number;
  /** Resume usage accumulation. */
  readonly usage?: Usage;
}

// ---------------------------------------------------------------------------
// DispatchHandle — live interface to a running dispatch
// ---------------------------------------------------------------------------

export interface DispatchHandle {
  readonly dispatchId: string;
  readonly events: Stream.Stream<DispatchEvent>;
  readonly inject: (i: Injection) => Effect.Effect<void>;
  readonly interrupt: Effect.Effect<void>;
  readonly result: Effect.Effect<DispatchOutput, DispatchError>;
  /** Snapshot current message history. */
  readonly messages: Effect.Effect<ReadonlyArray<Prompt.MessageEncoded>>;
}
