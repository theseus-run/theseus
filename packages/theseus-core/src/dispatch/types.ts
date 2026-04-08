/**
 * Dispatch types — observable events, injection, handle, and step results.
 *
 * Messages use Prompt.MessageEncoded from effect/unstable/ai directly.
 */

import { Data } from "effect";
import type { Effect, Stream } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { AgentError } from "../agent/index.ts";
import type { AgentResult } from "../agent/index.ts";
import type { ToolErrors } from "../tool/index.ts";

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
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  readonly callId: string;
  readonly name: string;
  readonly args: unknown;
  readonly content: string;
}

// ---------------------------------------------------------------------------
// ToolCallError — typed failure from tool execution
// ---------------------------------------------------------------------------

/** Tool not found in the blueprint's tools array. */
export class ToolCallUnknown extends Data.TaggedError("ToolCallUnknown")<{
  readonly callId: string;
  readonly name: string;
}> {}

/** Arguments failed JSON.parse. */
export class ToolCallBadArgs extends Data.TaggedError("ToolCallBadArgs")<{
  readonly callId: string;
  readonly name: string;
  readonly raw: string;
}> {}

/** Tool execution failed (wraps ToolError | ToolErrorInput | ToolErrorOutput from callTool). */
export class ToolCallFailed extends Data.TaggedError("ToolCallFailed")<{
  readonly callId: string;
  readonly name: string;
  readonly args: unknown;
  readonly cause: ToolErrors;
}> {}

/** Union of all tool call errors. */
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
  | { readonly _tag: "Calling";        readonly agent: string; readonly iteration: number }
  | { readonly _tag: "TextDelta";      readonly agent: string; readonly iteration: number; readonly content: string }
  | { readonly _tag: "ThinkingDelta";  readonly agent: string; readonly iteration: number; readonly content: string }
  | { readonly _tag: "Thinking";       readonly agent: string; readonly iteration: number; readonly content: string }
  | { readonly _tag: "ToolCalling";    readonly agent: string; readonly iteration: number; readonly tool: string; readonly args: unknown }
  | { readonly _tag: "ToolResult";     readonly agent: string; readonly iteration: number; readonly tool: string; readonly content: string }
  | { readonly _tag: "ToolError";     readonly agent: string; readonly iteration: number; readonly tool: string; readonly error: ToolCallError }
  | { readonly _tag: "Done";          readonly agent: string; readonly result: AgentResult }

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
// DispatchHandle — live interface to a running dispatch
// ---------------------------------------------------------------------------

export interface DispatchHandle {
  readonly events: Stream.Stream<DispatchEvent>
  readonly inject: (i: Injection) => Effect.Effect<void>
  readonly interrupt: Effect.Effect<void>
  readonly result: Effect.Effect<AgentResult, AgentError>
}
