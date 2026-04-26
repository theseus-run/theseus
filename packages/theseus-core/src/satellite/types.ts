/**
 * Satellite — dispatch-scoped control layer.
 *
 * A SatelliteRing is static ordered configuration. A SatelliteScope is opened
 * for one dispatch and owns that dispatch's satellite state/resources.
 * Satellites run in array order; non-terminal decisions feed later satellites.
 */

import type { Effect } from "effect";
import { Data } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { StepResult, ToolCall, ToolCallError, ToolCallResult } from "../dispatch/types.ts";
import type { Presentation } from "../tool/index.ts";

export interface SatelliteStartContext {
  readonly dispatchId: string;
  readonly name: string;
  readonly task: string;
}

export interface SatelliteContext extends SatelliteStartContext {
  readonly iteration: number;
}

export type SatelliteCheckpoint =
  | "dispatch-start"
  | "iteration-start"
  | "before-call"
  | "after-call"
  | "before-tools"
  | "after-tools"
  | "iteration-end"
  | "dispatch-end";

export interface BeforeCall {
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
}

export interface AfterCall {
  readonly stepResult: StepResult;
}

export interface BeforeTool {
  readonly tool: ToolCall;
}

export interface AfterTool {
  readonly tool: ToolCall;
  readonly result: ToolCallResult;
}

export interface ToolError {
  readonly tool: ToolCall;
  readonly error: ToolCallError;
}

export interface Pass {
  readonly _tag: "Pass";
}

export interface TransformMessages {
  readonly _tag: "TransformMessages";
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
}

export interface TransformStepResult {
  readonly _tag: "TransformStepResult";
  readonly stepResult: StepResult;
}

export interface ModifyArgs {
  readonly _tag: "ModifyArgs";
  readonly args: unknown;
}

export interface BlockTool {
  readonly _tag: "BlockTool";
  readonly presentation: Presentation;
}

export interface ReplaceToolResult {
  readonly _tag: "ReplaceToolResult";
  readonly presentation: Presentation;
}

export interface RecoverToolError {
  readonly _tag: "RecoverToolError";
  readonly result: ToolCallResult;
}

export type CheckpointDecision = Pass;
export type BeforeCallDecision = Pass | TransformMessages;
export type AfterCallDecision = Pass | TransformStepResult;
export type BeforeToolDecision = Pass | ModifyArgs | BlockTool;
export type AfterToolDecision = Pass | ReplaceToolResult;
export type ToolErrorDecision = Pass | RecoverToolError;

export type SatelliteDecision =
  | CheckpointDecision
  | BeforeCallDecision
  | AfterCallDecision
  | BeforeToolDecision
  | AfterToolDecision
  | ToolErrorDecision;

export class SatelliteAbort extends Data.TaggedError("SatelliteAbort")<{
  readonly satellite: string;
  readonly reason: string;
}> {}

export type SatelliteHook<S, Phase, Decision, R> = (
  phase: Phase,
  ctx: SatelliteContext,
  state: S,
) => Effect.Effect<{ readonly decision: Decision; readonly state: S }, SatelliteAbort, R>;

export interface Satellite<S = void, R = never> {
  readonly name: string;
  readonly open: (ctx: SatelliteStartContext) => Effect.Effect<S, never, R>;
  readonly close?: (state: S) => Effect.Effect<void, never, R>;
  readonly checkpoint?: SatelliteHook<S, SatelliteCheckpoint, CheckpointDecision, R>;
  readonly beforeCall?: SatelliteHook<S, BeforeCall, BeforeCallDecision, R>;
  readonly afterCall?: SatelliteHook<S, AfterCall, AfterCallDecision, R>;
  readonly beforeTool?: SatelliteHook<S, BeforeTool, BeforeToolDecision, R>;
  readonly afterTool?: SatelliteHook<S, AfterTool, AfterToolDecision, R>;
  readonly toolError?: SatelliteHook<S, ToolError, ToolErrorDecision, R>;
}

export interface SatelliteScope<R = never> {
  readonly checkpoint: (
    checkpoint: SatelliteCheckpoint,
    ctx: SatelliteContext,
    onAction?: (satellite: string, phase: string, action: string) => Effect.Effect<void>,
  ) => Effect.Effect<CheckpointDecision, SatelliteAbort, R>;
  readonly beforeCall: (
    phase: BeforeCall,
    ctx: SatelliteContext,
    onAction?: (satellite: string, phase: string, action: string) => Effect.Effect<void>,
  ) => Effect.Effect<BeforeCallDecision, SatelliteAbort, R>;
  readonly afterCall: (
    phase: AfterCall,
    ctx: SatelliteContext,
    onAction?: (satellite: string, phase: string, action: string) => Effect.Effect<void>,
  ) => Effect.Effect<AfterCallDecision, SatelliteAbort, R>;
  readonly beforeTool: (
    phase: BeforeTool,
    ctx: SatelliteContext,
    onAction?: (satellite: string, phase: string, action: string) => Effect.Effect<void>,
  ) => Effect.Effect<BeforeToolDecision, SatelliteAbort, R>;
  readonly afterTool: (
    phase: AfterTool,
    ctx: SatelliteContext,
    onAction?: (satellite: string, phase: string, action: string) => Effect.Effect<void>,
  ) => Effect.Effect<AfterToolDecision, SatelliteAbort, R>;
  readonly toolError: (
    phase: ToolError,
    ctx: SatelliteContext,
    onAction?: (satellite: string, phase: string, action: string) => Effect.Effect<void>,
  ) => Effect.Effect<ToolErrorDecision, SatelliteAbort, R>;
  readonly close: Effect.Effect<void, never, R>;
}

export const Pass: Pass = { _tag: "Pass" };
export const TransformMessages = (
  messages: ReadonlyArray<Prompt.MessageEncoded>,
): TransformMessages => ({
  _tag: "TransformMessages",
  messages,
});
export const TransformStepResult = (stepResult: StepResult): TransformStepResult => ({
  _tag: "TransformStepResult",
  stepResult,
});
export const ModifyArgs = (args: unknown): ModifyArgs => ({ _tag: "ModifyArgs", args });
export const BlockTool = (presentation: Presentation): BlockTool => ({
  _tag: "BlockTool",
  presentation,
});
export const ReplaceToolResult = (presentation: Presentation): ReplaceToolResult => ({
  _tag: "ReplaceToolResult",
  presentation,
});
export const RecoverToolError = (result: ToolCallResult): RecoverToolError => ({
  _tag: "RecoverToolError",
  result,
});

export type SatelliteRequirements<T> = T extends Satellite<infer _S, infer R> ? R : never;

// biome-ignore lint/suspicious/noExplicitAny: existential type for heterogeneous satellite lists
export type SatelliteAny = Satellite<any, any>;
