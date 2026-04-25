/**
 * Satellite — pipeline middleware for the dispatch loop.
 *
 * Satellites intercept the dispatch loop at well-defined phases.
 * Each satellite carries typed state across iterations and can
 * transform, block, or abort the pipeline at any phase.
 *
 * Ship metaphor: satellites orbit the vessel, observing and
 * intervening in its trajectory.
 */

import type { Effect } from "effect";
import { Data } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { AgentCompletion } from "../agent/index.ts";
import type { StepResult, ToolCall, ToolCallError, ToolCallResult } from "../dispatch/types.ts";

// ---------------------------------------------------------------------------
// Phase — where in the loop we are
// ---------------------------------------------------------------------------

export type Phase =
  | { readonly _tag: "BeforeCall"; readonly messages: ReadonlyArray<Prompt.MessageEncoded> }
  | { readonly _tag: "AfterCall"; readonly stepResult: StepResult }
  | { readonly _tag: "BeforeTool"; readonly tool: ToolCall }
  | { readonly _tag: "AfterTool"; readonly tool: ToolCall; readonly result: ToolCallResult }
  | { readonly _tag: "ToolError"; readonly tool: ToolCall; readonly error: ToolCallError };

// ---------------------------------------------------------------------------
// Action — what the satellite wants to do
// ---------------------------------------------------------------------------

export type Action =
  /** No-op — pass through unchanged. */
  | { readonly _tag: "Pass" }
  /** Replace the message array before LLM call. Valid in: BeforeCall. */
  | { readonly _tag: "TransformMessages"; readonly messages: ReadonlyArray<Prompt.MessageEncoded> }
  /** Replace the StepResult after LLM call. Valid in: AfterCall. */
  | { readonly _tag: "TransformStepResult"; readonly stepResult: StepResult }
  /** Modify tool call arguments before execution. Valid in: BeforeTool. */
  | { readonly _tag: "ModifyArgs"; readonly args: unknown }
  /** Block tool execution, use synthetic result. Valid in: BeforeTool. */
  | { readonly _tag: "BlockTool"; readonly content: string }
  /** Replace tool result content. Valid in: AfterTool. */
  | { readonly _tag: "ReplaceResult"; readonly content: string }
  /** Recover from tool error with a result. Valid in: ToolError. */
  | { readonly _tag: "RecoverToolError"; readonly result: ToolCallResult }
  /** Complete the dispatch with a typed agent result. Valid in any phase. */
  | { readonly _tag: "Complete"; readonly result: AgentCompletion };

// ---------------------------------------------------------------------------
// SatelliteContext — loop state available to all hooks
// ---------------------------------------------------------------------------

export interface SatelliteContext {
  readonly agent: string;
  readonly iteration: number;
}

// ---------------------------------------------------------------------------
// SatelliteAbort — satellite wants to kill the dispatch
// ---------------------------------------------------------------------------

export class SatelliteAbort extends Data.TaggedError("SatelliteAbort")<{
  readonly satellite: string;
  readonly reason: string;
}> {}

// ---------------------------------------------------------------------------
// Satellite — a single middleware unit
// ---------------------------------------------------------------------------

export interface Satellite<S = void> {
  readonly name: string;
  readonly initial: S;
  readonly handle: (
    phase: Phase,
    ctx: SatelliteContext,
    state: S,
  ) => Effect.Effect<{ readonly action: Action; readonly state: S }, SatelliteAbort>;
}

// ---------------------------------------------------------------------------
// Action constructors — avoid `as const` noise in satellite implementations
// ---------------------------------------------------------------------------

export const Pass: Action = { _tag: "Pass" };
export const TransformMessages = (messages: ReadonlyArray<Prompt.MessageEncoded>): Action => ({
  _tag: "TransformMessages",
  messages,
});
export const TransformStepResult = (stepResult: StepResult): Action => ({
  _tag: "TransformStepResult",
  stepResult,
});
export const ModifyArgs = (args: unknown): Action => ({ _tag: "ModifyArgs", args });
export const BlockTool = (content: string): Action => ({ _tag: "BlockTool", content });
export const ReplaceResult = (content: string): Action => ({ _tag: "ReplaceResult", content });
export const RecoverToolError = (result: ToolCallResult): Action => ({
  _tag: "RecoverToolError",
  result,
});
export const Complete = (result: AgentCompletion): Action => ({ _tag: "Complete", result });

// ---------------------------------------------------------------------------
// SatelliteAny — existential type for heterogeneous satellite arrays
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: existential type for satellite collections
export type SatelliteAny = Satellite<any>;
