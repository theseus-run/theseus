import { Context, Data, Effect, Layer } from "effect";
import type { Blueprint } from "./index.ts";

export class BlueprintNotFound extends Data.TaggedError("BlueprintNotFound")<{
  readonly name: string;
}> {}

export interface BlueprintSummary {
  readonly name: string;
  readonly description?: string;
}

export class BlueprintRegistry extends Context.Service<
  BlueprintRegistry,
  {
    readonly get: (name: string) => Effect.Effect<Blueprint, BlueprintNotFound>;
    readonly list: Effect.Effect<ReadonlyArray<BlueprintSummary>>;
  }
>()("BlueprintRegistry") {}

export const BlueprintRegistryLive = (
  blueprints: ReadonlyArray<Blueprint>,
): Layer.Layer<BlueprintRegistry> => {
  const byName = new Map(blueprints.map((blueprint) => [blueprint.name, blueprint]));
  return Layer.succeed(BlueprintRegistry)({
    get: (name) => {
      const blueprint = byName.get(name);
      return blueprint ? Effect.succeed(blueprint) : Effect.fail(new BlueprintNotFound({ name }));
    },
    list: Effect.succeed(blueprints.map((blueprint) => ({ name: blueprint.name }))),
  });
};
