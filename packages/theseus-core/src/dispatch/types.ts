/**
 * Dispatch types — observable events, injection, handle, and step results.
 */

import type { Effect, Stream } from "effect";
import type { AgentError } from "../agent/index.ts";
import type { AgentResult } from "../agent/index.ts";
import type { LLMMessage, LLMToolCall, LLMUsage } from "../llm/provider.ts";

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
// StepResult — outcome of a single LLM call (no tool execution)
// ---------------------------------------------------------------------------

export type StepResult = StepText | StepToolCalls;

export interface StepText {
  readonly _tag: "text";
  readonly content: string;
  readonly thinking?: string;
  readonly usage: LLMUsage;
}

export interface StepToolCalls {
  readonly _tag: "tool_calls";
  readonly toolCalls: ReadonlyArray<LLMToolCall>;
  readonly thinking?: string;
  readonly usage: LLMUsage;
}

// ---------------------------------------------------------------------------
// DispatchEvent — observable state transitions of the dispatch loop
// ---------------------------------------------------------------------------

export type DispatchEvent =
  | { readonly _tag: "Calling";     readonly agent: string; readonly iteration: number }
  | { readonly _tag: "Thinking";    readonly agent: string; readonly iteration: number; readonly content: string }
  | { readonly _tag: "ToolCalling"; readonly agent: string; readonly iteration: number; readonly tool: string; readonly args: unknown }
  | { readonly _tag: "ToolResult";  readonly agent: string; readonly iteration: number; readonly tool: string; readonly content: string }
  | { readonly _tag: "Done";        readonly agent: string; readonly result: AgentResult }

// ---------------------------------------------------------------------------
// Injection — loop mutations pushed from outside
// ---------------------------------------------------------------------------

export type Injection =
  | { readonly _tag: "AppendMessages";  readonly messages: ReadonlyArray<LLMMessage> }
  | { readonly _tag: "ReplaceMessages"; readonly messages: ReadonlyArray<LLMMessage> }
  | { readonly _tag: "CollapseContext" }
  | { readonly _tag: "Interrupt";       readonly reason?: string }
  | { readonly _tag: "Redirect";        readonly task: string }

// ---------------------------------------------------------------------------
// DispatchHandle — live interface to a running dispatch
// ---------------------------------------------------------------------------

export interface DispatchHandle {
  /**
   * Observable event stream. Completes after Done. Never fails —
   * loop errors surface via result only.
   */
  readonly events: Stream.Stream<DispatchEvent>
  /** Push an injection — processed at the start of the next iteration. */
  readonly inject: (i: Injection) => Effect.Effect<void>
  /**
   * Preemptive cancellation — kills the loop immediately, mid-call if needed.
   * result will fail with AgentError("Interrupted").
   */
  readonly interrupt: Effect.Effect<void>
  /** Await the final result. Fails with AgentError on loop failure or interrupt. */
  readonly result: Effect.Effect<AgentResult, AgentError>
}
