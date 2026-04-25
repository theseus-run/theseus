/**
 * ToolRegistry — resolves tool names to full Tool objects.
 *
 * The client sends a SerializedBlueprint with tool names.
 * The server looks up actual Tool implementations by name.
 */

import type * as Agent from "@theseus.run/core/Agent";
import type * as Tool from "@theseus.run/core/Tool";
import { Context } from "effect";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ToolRegistry extends Context.Service<
  ToolRegistry,
  {
    readonly resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.AnyWith<never>>;
  }
>()("ToolRegistry") {}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const makeToolRegistry = (
  tools: ReadonlyArray<Tool.AnyWith<never>>,
): { resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.AnyWith<never>> } => {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    resolve: (names: ReadonlyArray<string>): ReadonlyArray<Tool.AnyWith<never>> =>
      names.length === 0
        ? tools
        : names.flatMap((n) => {
            const tool = byName.get(n);
            return tool ? [tool] : [];
          }),
  };
};

// ---------------------------------------------------------------------------
// resolveBlueprint — SerializedBlueprint → Blueprint
// ---------------------------------------------------------------------------

export const resolveBlueprint = (
  serialized: {
    readonly name: string;
    readonly systemPrompt: string;
    readonly tools: ReadonlyArray<{ readonly name: string }>;
    readonly maxIterations?: number | undefined;
    readonly model?: string | undefined;
  },
  toolRegistry: { resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.AnyWith<never>> },
): Agent.Blueprint => ({
  name: serialized.name,
  systemPrompt: serialized.systemPrompt,
  tools: toolRegistry.resolve(serialized.tools.map((t) => t.name)),
  ...(serialized.maxIterations !== undefined ? { maxIterations: serialized.maxIterations } : {}),
  ...(serialized.model !== undefined ? { model: serialized.model } : {}),
});
