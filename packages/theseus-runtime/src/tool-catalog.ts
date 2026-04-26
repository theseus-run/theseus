/**
 * ToolCatalog — runtime-side capability catalog.
 *
 * Client specs name tools; the runtime resolves those names to executable
 * Tool values. Empty selections mean no tools. Intentional presets such as
 * "all tools" belong in server-side spec construction, not this boundary.
 */

import type * as Dispatch from "@theseus.run/core/Dispatch";
import type * as Tool from "@theseus.run/core/Tool";
import { Context, Data, Effect } from "effect";

export interface SerializedDispatchSpec {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<{ readonly name: string }>;
  readonly maxIterations?: number | undefined;
  readonly model?: string | undefined;
}

export class ToolCatalog extends Context.Service<ToolCatalog, ToolCatalogService>()(
  "ToolCatalog",
) {}

export class ToolCatalogMissing extends Data.TaggedError("ToolCatalogMissing")<{
  readonly names: ReadonlyArray<string>;
}> {}

export interface ToolCatalogService {
  readonly resolve: (
    names: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<Tool.ToolAny>, ToolCatalogMissing>;
  readonly hydrate: (
    spec: SerializedDispatchSpec,
  ) => Effect.Effect<Dispatch.DispatchSpec<unknown>, ToolCatalogMissing>;
}

export const makeToolCatalog = (tools: ReadonlyArray<Tool.ToolAny>): ToolCatalogService => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const resolve = (
    names: ReadonlyArray<string>,
  ): Effect.Effect<ReadonlyArray<Tool.ToolAny>, ToolCatalogMissing> =>
    Effect.gen(function* () {
      const missing = names.filter((name) => !byName.has(name));
      if (missing.length > 0) {
        return yield* new ToolCatalogMissing({ names: missing });
      }

      return names.flatMap((name) => {
        const tool = byName.get(name);
        return tool ? [tool] : [];
      });
    });

  return {
    resolve,
    hydrate: (spec: SerializedDispatchSpec) =>
      Effect.gen(function* () {
        const tools = yield* resolve(spec.tools.map((tool) => tool.name));
        return {
          name: spec.name,
          systemPrompt: spec.systemPrompt,
          tools,
          ...(spec.maxIterations !== undefined ? { maxIterations: spec.maxIterations } : {}),
          ...(spec.model !== undefined ? { model: spec.model } : {}),
        };
      }),
  };
};
