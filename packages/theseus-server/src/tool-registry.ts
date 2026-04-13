/**
 * ToolRegistry — resolves tool names to full Tool objects.
 *
 * The client sends a SerializedBlueprint with tool names.
 * The server looks up actual Tool implementations by name.
 */

import * as ServiceMap from "effect/ServiceMap";
import type * as Tool from "@theseus.run/core/Tool";
import type * as Agent from "@theseus.run/core/Agent";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ToolRegistry extends ServiceMap.Service<
  ToolRegistry,
  {
    readonly resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.Any>;
  }
>()("ToolRegistry") {}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const makeToolRegistry = (
  tools: ReadonlyArray<Tool.Any>,
): { resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.Any> } => {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    resolve: (names: ReadonlyArray<string>): ReadonlyArray<Tool.Any> =>
      names.length === 0
        ? (tools as Tool.Any[])
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
  toolRegistry: { resolve: (names: ReadonlyArray<string>) => ReadonlyArray<Tool.Any> },
): Agent.Blueprint => ({
  name: serialized.name,
  systemPrompt: serialized.systemPrompt,
  tools: toolRegistry.resolve(serialized.tools.map((t) => t.name)),
  ...(serialized.maxIterations !== undefined ? { maxIterations: serialized.maxIterations } : {}),
  ...(serialized.model !== undefined ? { model: serialized.model } : {}),
});
