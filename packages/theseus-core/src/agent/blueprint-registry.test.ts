import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  BlueprintNotFound,
  BlueprintRegistry,
  BlueprintRegistryLive,
} from "./blueprint-registry.ts";
import type { Blueprint } from "./index.ts";

const blueprint = (name: string): Blueprint => ({
  name,
  systemPrompt: `system:${name}`,
  tools: [],
});

const run = <A, E>(effect: Effect.Effect<A, E, BlueprintRegistry>) =>
  Effect.runPromise(Effect.provide(effect, BlueprintRegistryLive([blueprint("alpha")])));

describe("BlueprintRegistryLive", () => {
  test("gets a blueprint by name", async () => {
    const found = await run(
      Effect.gen(function* () {
        const registry = yield* BlueprintRegistry;
        return yield* registry.get("alpha");
      }),
    );

    expect(found.name).toBe("alpha");
    expect(found.systemPrompt).toBe("system:alpha");
  });

  test("fails with BlueprintNotFound for unknown names", async () => {
    const error = await run(
      Effect.gen(function* () {
        const registry = yield* BlueprintRegistry;
        return yield* Effect.flip(registry.get("missing"));
      }),
    );

    expect(error).toBeInstanceOf(BlueprintNotFound);
    expect(error.name).toBe("missing");
  });

  test("lists blueprint summaries", async () => {
    const summaries = await run(
      Effect.gen(function* () {
        const registry = yield* BlueprintRegistry;
        return yield* registry.list;
      }),
    );

    expect(summaries).toEqual([{ name: "alpha" }]);
  });
});
