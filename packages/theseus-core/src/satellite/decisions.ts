import { Match } from "effect";
import type {
  AfterCall,
  AfterCallDecision,
  AfterTool,
  AfterToolDecision,
  BeforeCall,
  BeforeCallDecision,
  BeforeTool,
  BeforeToolDecision,
  CheckpointDecision,
  SatelliteDecision,
  ToolError,
  ToolErrorDecision,
} from "./types.ts";

export const isTerminalDecision = (decision: SatelliteDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => false),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => true),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => true),
    Match.exhaustive,
  );

export const isCheckpointDecision = (decision: SatelliteDecision): decision is CheckpointDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => true),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

export const isBeforeCallDecision = (decision: SatelliteDecision): decision is BeforeCallDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => true),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

export const isAfterCallDecision = (decision: SatelliteDecision): decision is AfterCallDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => true),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

export const isBeforeToolDecision = (decision: SatelliteDecision): decision is BeforeToolDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => true),
    Match.tag("BlockTool", () => true),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

export const isAfterToolDecision = (decision: SatelliteDecision): decision is AfterToolDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => true),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

export const isToolErrorDecision = (decision: SatelliteDecision): decision is ToolErrorDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => true),
    Match.exhaustive,
  );

export const applyCheckpointDecision = <Phase extends string>(
  phase: Phase,
  _decision: CheckpointDecision,
): Phase => phase;

export const applyBeforeCallDecision = (
  phase: BeforeCall,
  decision: BeforeCallDecision,
): BeforeCall =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => phase),
    Match.tag("TransformMessages", (d) => ({ messages: d.messages })),
    Match.exhaustive,
  );

export const applyAfterCallDecision = (phase: AfterCall, decision: AfterCallDecision): AfterCall =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => phase),
    Match.tag("TransformStepResult", (d) => ({ stepResult: d.stepResult })),
    Match.exhaustive,
  );

export const applyBeforeToolDecision = (
  phase: BeforeTool,
  decision: BeforeToolDecision,
): BeforeTool =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => phase),
    Match.tag("ModifyArgs", (d) => ({
      tool: { ...phase.tool, arguments: JSON.stringify(d.args) },
    })),
    Match.tag("BlockTool", () => phase),
    Match.exhaustive,
  );

export const applyAfterToolDecision = (phase: AfterTool, _decision: AfterToolDecision): AfterTool =>
  phase;

export const applyToolErrorDecision = (phase: ToolError, _decision: ToolErrorDecision): ToolError =>
  phase;
