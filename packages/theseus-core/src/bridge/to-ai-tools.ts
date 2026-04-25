/**
 * Bridge: Theseus `Tool` / `Toolkit` → `@effect/ai` `Tool` / `Toolkit`.
 *
 * Used with `disableToolCallResolution: true` on `LanguageModel.generateText`
 * / `streamText`: the AI framework sees tool definitions (name, description,
 * schemas) and passes them to the model, but never invokes the handlers —
 * Theseus's dispatch loop owns execution via `callTool`.
 *
 * Because both libraries use `effect/Schema`, the conversion is direct:
 *   AiTool.make(name, { description, parameters, success, failure })
 *
 * No JSON-schema hack, no `dynamic` sentinel, no `(x as any).jsonSchema = …`.
 */

import { Schema } from "effect";
import * as AiTool from "effect/unstable/ai/Tool";
import * as AiToolkit from "effect/unstable/ai/Toolkit";
import type { Tool, ToolAny } from "../tool/index.ts";
import type { Toolkit } from "../tool/toolkit.ts";

// ---------------------------------------------------------------------------
// Single-tool conversion
// ---------------------------------------------------------------------------

/**
 * Convert one Theseus tool to an `@effect/ai` tool, with all schemas wired.
 *
 * The handler is never invoked when used with `disableToolCallResolution: true`.
 * Theseus's dispatch loop calls `callTool` directly.
 */
export const toAiTool = <I, O, F, R>(tool: Tool<I, O, F, R>): AiTool.Any =>
  AiTool.make(tool.name, {
    description: tool.description,
    // biome-ignore lint/suspicious/noExplicitAny: Schema.Schema<T> widens to Schema.Top at the call site
    parameters: tool.input as Schema.Schema<any>,
    // biome-ignore lint/suspicious/noExplicitAny: same
    success: tool.output as Schema.Schema<any>,
    // biome-ignore lint/suspicious/noExplicitAny: same
    failure: tool.failure as Schema.Schema<any>,
  }) as unknown as AiTool.Any;

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
  return AiToolkit.make(...(aiTools as [AiTool.Any, ...AiTool.Any[]])) as AiToolkit.Toolkit<
    Record<string, AiTool.Any>
  >;
};

// ---------------------------------------------------------------------------
// Plain tool definitions — for provider SDKs that don't use `@effect/ai`
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/**
 * Extract plain `{ name, description, inputSchema }` definitions — for raw
 * provider APIs (Anthropic, OpenAI, Gemini) that take JSON Schema directly.
 */
export const toToolDefinitions = (toolkit: Toolkit<unknown>): ReadonlyArray<ToolDefinition> =>
  toolkit.tools.map((t) => ({
    name: t.name,
    description: t.description,
    // biome-ignore lint/suspicious/noExplicitAny: Schema.toJsonSchemaDocument accepts Top
    inputSchema: jsonSchemaOf(t.input as any),
  }));

// biome-ignore lint/suspicious/noExplicitAny: Schema.Top is the widest; we accept it opaquely
const jsonSchemaOf = (schema: any): Record<string, unknown> => {
  const doc = Schema.toJsonSchemaDocument(schema);
  return doc.schema as Record<string, unknown>;
};
