/**
 * Bridge: Tool<I,O>[] → effect/unstable/ai Tool.Any[]
 *
 * Wraps our Theseus tools for consumption by LanguageModel providers.
 * The bridge creates @effect/ai Tool definitions with matching name,
 * description, and JSON schema.
 *
 * Since we use disableToolCallResolution: true in our dispatch loop,
 * handlers are never called by the framework — we handle tool execution
 * ourselves via callTool.
 */

import { Schema } from "effect";
import * as AiTool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import type { ToolAny } from "../tool/index.ts";

/**
 * Convert a single Theseus Tool<I,O> to an @effect/ai Tool.Any.
 *
 * The resulting AI tool carries the same name, description, and JSON schema.
 * Parameters use Schema.Unknown since we handle decoding ourselves.
 */
export const theseusToolToAiTool = (tool: ToolAny): AiTool.Any =>
  AiTool.make(tool.name, {
    description: tool.description,
    success: Schema.String,
    failure: Schema.String,
    failureMode: "return" as const,
  });

/**
 * Build an @effect/ai Toolkit from an array of Theseus tools.
 *
 * Used with disableToolCallResolution: true — the toolkit provides
 * tool definitions to the LLM but handlers are never invoked by
 * the framework (our dispatch loop handles execution).
 */
export const theseusToolsToToolkit = (
  tools: ReadonlyArray<ToolAny>,
): Toolkit.Toolkit<Record<string, AiTool.Any>> => {
  if (tools.length === 0) return Toolkit.empty as any;
  const aiTools = tools.map(theseusToolToAiTool);
  return Toolkit.make(...(aiTools as [AiTool.Any, ...AiTool.Any[]])) as any;
};

/**
 * Extract plain tool definitions (name + description + JSON schema)
 * from Theseus tools. Used by providers that need raw tool defs
 * rather than @effect/ai Tool objects.
 */
export const extractToolDefs = (
  tools: ReadonlyArray<ToolAny>,
): ReadonlyArray<{ name: string; description: string; inputSchema: Record<string, unknown> }> =>
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
