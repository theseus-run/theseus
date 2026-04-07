/**
 * Bridge: Tool<I,O>[] → effect/unstable/ai Tool.Any[] and Toolkit
 *
 * Wraps our Theseus tools for consumption by LanguageModel.
 * Uses AiTool.dynamic which accepts any params — our dispatch loop
 * handles decoding/execution via callTool, not the ai framework.
 */

import * as AiTool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";
import type { ToolAny } from "../tool/index.ts";

/**
 * Convert a single Theseus Tool<I,O> to an @effect/ai dynamic Tool.
 *
 * Dynamic tools accept any parameters without schema validation,
 * which is what we need since we handle validation ourselves via callTool.
 */
export const theseusToolToAiTool = (tool: ToolAny): AiTool.Any => {
  const aiTool = AiTool.dynamic(tool.name, { description: tool.description });
  // Attach inputSchema so providers can read it directly (getJsonSchema doesn't work for dynamic tools)
  (aiTool as any).inputSchema = tool.inputSchema;
  return aiTool;
};

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
 * from Theseus tools.
 */
export const extractToolDefs = (
  tools: ReadonlyArray<ToolAny>,
): ReadonlyArray<{ name: string; description: string; inputSchema: Record<string, unknown> }> =>
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
