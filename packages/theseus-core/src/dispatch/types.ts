/**
 * Dispatch types — observable events, injection, handle, and step results.
 *
 * Messages use Prompt.MessageEncoded from effect/unstable/ai directly.
 */

import { Data } from "effect";
import type { Effect, Stream } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { AgentError, AgentResult } from "../agent/index.ts";
import type { Presentation } from "../tool/index.ts";
import type { ToolDefect, ToolInputError } from "../tool/index.ts";

// ---------------------------------------------------------------------------
// Usage — simple token counts for accumulation across iterations
// ---------------------------------------------------------------------------

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

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
  readonly presentation: Presentation;
  readonly textContent: string;
}

// ---------------------------------------------------------------------------
// ToolCallError — typed failures during tool dispatch (not covered by Presentation)
// ---------------------------------------------------------------------------

/** Tool not found in the blueprint's toolkit. */
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
  readonly cause: ToolInputError | ToolDefect;
}> {}

/** Union of all tool-dispatch errors. */
export type ToolCallError = ToolCallUnknown | ToolCallBadArgs | ToolCallFailed;

// ---------------------------------------------------------------------------
// StepResult — outcome of a single LLM call (no tool execution)
// ---------------------------------------------------------------------------

export type StepResult = StepText | StepToolCalls;

export interface StepText {
  readonly _tag: "text";
  readonly content: string;
  readonly thinking?: string;
  readonly usage: Usage;
}

export interface StepToolCalls {
  readonly _tag: "tool_calls";
  readonly toolCalls: ReadonlyArray<ToolCall>;
  readonly thinking?: string;
  readonly usage: Usage;
}

// ---------------------------------------------------------------------------
// DispatchEvent — observable state transitions of the dispatch loop
// ---------------------------------------------------------------------------

export type DispatchEvent =
  | { readonly _tag: "Calling";          readonly agent: string; readonly iteration: number }
  | { readonly _tag: "TextDelta";        readonly agent: string; readonly iteration: number; readonly content: string }
  | { readonly _tag: "ThinkingDelta";    readonly agent: string; readonly iteration: number; readonly content: string }
  | { readonly _tag: "Thinking";         readonly agent: string; readonly iteration: number; readonly content: string }
  | { readonly _tag: "ToolCalling";      readonly agent: string; readonly iteration: number; readonly tool: string; readonly args: unknown }
  | { readonly _tag: "ToolResult";       readonly agent: string; readonly iteration: number; readonly tool: string; readonly content: string; readonly isError: boolean }
  | { readonly _tag: "ToolError";        readonly agent: string; readonly iteration: number; readonly tool: string; readonly error: ToolCallError }
  | { readonly _tag: "SatelliteAction";  readonly agent: string; readonly iteration: number; readonly satellite: string; readonly phase: string; readonly action: string }
  | { readonly _tag: "Injected";         readonly agent: string; readonly iteration: number; readonly injection: string; readonly detail?: string }
  | { readonly _tag: "Done";             readonly agent: string; readonly result: AgentResult }

// ---------------------------------------------------------------------------
// Injection — loop mutations pushed from outside
// ---------------------------------------------------------------------------

export type Injection =
  | { readonly _tag: "AppendMessages";  readonly messages: ReadonlyArray<Prompt.MessageEncoded> }
  | { readonly _tag: "ReplaceMessages"; readonly messages: ReadonlyArray<Prompt.MessageEncoded> }
  | { readonly _tag: "CollapseContext" }
  | { readonly _tag: "Interrupt";       readonly reason?: string }
  | { readonly _tag: "Redirect";        readonly task: string }

// ---------------------------------------------------------------------------
// DispatchOptions — optional configuration for dispatch
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  /** Dispatch identifier for logging/restore. Auto-generated if omitted. */
  readonly dispatchId?: string
  /** Link to parent dispatch (for delegate → worker tracing). */
  readonly parentDispatchId?: string
  /** Restore from a previous session — replaces the default [system, user] messages. */
  readonly messages?: ReadonlyArray<Prompt.MessageEncoded>
  /** Resume iteration count (for usage tracking continuity). */
  readonly iteration?: number
  /** Resume usage accumulation. */
  readonly usage?: Usage
}

// ---------------------------------------------------------------------------
// DispatchHandle — live interface to a running dispatch
// ---------------------------------------------------------------------------

export interface DispatchHandle {
  readonly dispatchId: string
  readonly events: Stream.Stream<DispatchEvent>
  readonly inject: (i: Injection) => Effect.Effect<void>
  readonly interrupt: Effect.Effect<void>
  readonly result: Effect.Effect<AgentResult, AgentError>
  /** Snapshot current message history. */
  readonly messages: Effect.Effect<ReadonlyArray<Prompt.MessageEncoded>>
}
