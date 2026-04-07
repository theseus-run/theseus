import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Capsule, CapsuleError, CapsuleId } from "./index.ts";
import { CapsuleLive } from "./memory.ts";

const run = <A>(effect: Effect.Effect<A, any, Capsule>) =>
  Effect.runPromise(Effect.provide(effect, CapsuleLive("test")));

describe("CapsuleId", () => {
  test("includes slug and date components", () => {
    const id = CapsuleId("my-mission");
    expect(id).toContain("my-mission");
    expect(id.length).toBeGreaterThan(20);
  });
});

describe("Capsule.log + read", () => {
  test("appends events and reads them back in order", async () => {
    const events = await run(
      Effect.gen(function* () {
        const capsule = yield* Capsule;
        yield* capsule.log({ type: "mission.create", by: "runtime", data: { goal: "test" } });
        yield* capsule.log({ type: "mission.plan", by: "theseus", data: { path: "plan.md" } });
        yield* capsule.log({ type: "mission.friction", by: "forge", data: { reason: "unclear spec" } });
        return yield* capsule.read();
      }),
    );

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(["mission.create", "mission.plan", "mission.friction"]);
    expect(events.map((e) => e.by)).toEqual(["runtime", "theseus", "forge"]);
    // All events have auto-set timestamps
    events.forEach((e) => expect(e.at).toBeTruthy());
  });

  test("empty capsule reads as empty array", async () => {
    const events = await run(
      Effect.gen(function* () {
        const capsule = yield* Capsule;
        return yield* capsule.read();
      }),
    );
    expect(events).toEqual([]);
  });
});

describe("Capsule.artifact + readArtifact", () => {
  test("writes and reads an artifact", async () => {
    const content = await run(
      Effect.gen(function* () {
        const capsule = yield* Capsule;
        yield* capsule.artifact("plan.md", "# Plan\n\n1. Do the thing");
        return yield* capsule.readArtifact("plan.md");
      }),
    );
    expect(content).toBe("# Plan\n\n1. Do the thing");
  });

  test("overwrites existing artifact", async () => {
    const content = await run(
      Effect.gen(function* () {
        const capsule = yield* Capsule;
        yield* capsule.artifact("plan.md", "v1");
        yield* capsule.artifact("plan.md", "v2");
        return yield* capsule.readArtifact("plan.md");
      }),
    );
    expect(content).toBe("v2");
  });

  test("readArtifact fails for missing artifact", async () => {
    const error = await Effect.runPromise(
      Effect.provide(
        Effect.flip(
          Effect.gen(function* () {
            const capsule = yield* Capsule;
            return yield* capsule.readArtifact("nonexistent.md");
          }),
        ),
        CapsuleLive("test"),
      ),
    );
    expect(error).toBeInstanceOf(CapsuleError);
    expect((error as CapsuleError).message).toContain("not found");
  });
});

describe("Capsule.id", () => {
  test("exposes the capsule id", async () => {
    const id = await run(
      Effect.gen(function* () {
        const capsule = yield* Capsule;
        return capsule.id;
      }),
    );
    expect(id).toContain("test");
  });
});
