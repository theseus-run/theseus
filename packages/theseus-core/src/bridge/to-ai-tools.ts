/**
 * Bridge: Theseus `Tool` / `Toolkit` -> `@effect/ai` `Tool` / `Toolkit`.
 *
 * Used with `disableToolCallResolution: true` on `LanguageModel.generateText`
 * / `streamText`: the AI framework sees tool definitions (name, description,
 * schemas) and passes them to the model, but never invokes the handlers -
 * Theseus's dispatch loop owns execution via `callTool`.
 *
 * Because both libraries use `effect/Schema`, the conversion is direct:
 *   AiTool.make(name, { description, parameters, success, failure })
 *
 * No JSON-schema hack, no dynamic sentinel, no provider-specific shape here.
 */

import * as AiTool from "effect/unstable/ai/Tool";
import * as AiToolkit from "effect/unstable/ai/Toolkit";
import type { Tool, ToolAny } from "../tool/index.ts";
import type { Toolkit } from "../tool/toolkit.ts";

type AiToolFromTheseus<I, O, F, R> = AiTool.Tool<
  string,
  {
    readonly parameters: Tool<I, O, F, R>["input"];
    readonly success: Tool<I, O, F, R>["output"];
    readonly failure: Tool<I, O, F, R>["failure"];
    readonly failureMode: "error";
  }
>;

// ---------------------------------------------------------------------------
// Single-tool conversion
// ---------------------------------------------------------------------------

/**
 * Convert one Theseus tool to an `@effect/ai` tool, with all schemas wired.
 *
 * The handler is never invoked when used with `disableToolCallResolution: true`.
 * Theseus's dispatch loop calls `callTool` directly.
 */
export const toAiTool = <I, O, F, R>(tool: Tool<I, O, F, R>): AiToolFromTheseus<I, O, F, R> =>
  AiTool.make(tool.name, {
    description: tool.description,
    parameters: tool.input,
    success: tool.output,
    failure: tool.failure,
  }) as AiToolFromTheseus<I, O, F, R>;

// ---------------------------------------------------------------------------
// Toolkit conversion
// ---------------------------------------------------------------------------

/** Convert a Theseus Toolkit to an `@effect/ai` Toolkit (definitions only). */
export const toAiToolkit = (
  toolkit: Toolkit<unknown>,
): AiToolkit.Toolkit<Record<string, AiTool.Any>> => toolsArrayToAiToolkit(toolkit.tools);

/** Convert a raw array of Theseus tools. Prefer `toAiToolkit` with a `Toolkit`. */
export const toolsArrayToAiToolkit = (
  tools: ReadonlyArray<ToolAny>,
): AiToolkit.Toolkit<Record<string, AiTool.Any>> => {
  if (tools.length === 0) {
    return AiToolkit.empty as AiToolkit.Toolkit<Record<string, AiTool.Any>>;
  }
  const aiTools = tools.map(toAiTool);
  return AiToolkit.make(
    ...(aiTools as unknown as [AiTool.Any, ...AiTool.Any[]]),
  ) as AiToolkit.Toolkit<Record<string, AiTool.Any>>;
};
