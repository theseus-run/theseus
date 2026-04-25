import { describe, expect, test } from "bun:test";
import { Effect, Layer, Random } from "effect";
import { TestClock } from "effect/testing";
import { AgentIdentityLive } from "../agent/index.ts";
import * as Tool from "../Tool.ts";
import { CapsuleError, CurrentCapsule, makeCapsuleId } from "./index.ts";
import { CurrentCapsuleLive } from "./memory.ts";
import { logCapsuleTool, readCapsuleTool } from "./tools.ts";

const run = <A>(effect: Effect.Effect<A, unknown, CurrentCapsule>) =>
  Effect.runPromise(Effect.provide(effect, CurrentCapsuleLive("test")));

describe("makeCapsuleId", () => {
  test("includes slug and date components", async () => {
    const id = await Effect.runPromise(makeCapsuleId("my-mission"));
    expect(id).toContain("my-mission");
    expect(id.length).toBeGreaterThan(20);
  });

  test("uses Effect Clock and Random services", async () => {
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.UTC(2024, 0, 2, 3, 4));
        const a = yield* makeCapsuleId("deterministic").pipe(Random.withSeed("capsule"));
        const b = yield* makeCapsuleId("deterministic").pipe(Random.withSeed("capsule"));
        return [a, b] as const;
      }).pipe(Effect.provide(TestClock.layer()), Effect.scoped),
    );

    expect(first).toBe(second);
    expect(first).toStartWith("20240102-0304-");
    expect(first).toContain("-deterministic");
  });
});

describe("Capsule.log + read", () => {
  test("appends events and reads them back in order", async () => {
    const events = await run(
      Effect.gen(function* () {
        const capsule = yield* CurrentCapsule;
        yield* capsule.log({ type: "mission.create", by: "runtime", data: { goal: "test" } });
        yield* capsule.log({ type: "mission.plan", by: "theseus", data: { path: "plan.md" } });
        yield* capsule.log({
          type: "mission.friction",
          by: "forge",
          data: { reason: "unclear spec" },
        });
        return yield* capsule.read();
      }),
    );

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      "mission.create",
      "mission.plan",
      "mission.friction",
    ]);
    expect(events.map((e) => e.by)).toEqual(["runtime", "theseus", "forge"]);
    // All events have auto-set timestamps
    for (const event of events) {
      expect(event.at).toBeTruthy();
    }
  });

  test("timestamps events from Effect Clock", async () => {
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.UTC(2024, 0, 2, 3, 4, 5));
        const capsule = yield* CurrentCapsule;
        yield* capsule.log({ type: "mission.create", by: "runtime", data: {} });
        return yield* capsule.read();
      }).pipe(
        Effect.provide(Layer.merge(CurrentCapsuleLive("test"), TestClock.layer())),
        Effect.scoped,
      ),
    );

    expect(events[0]?.at).toBe("2024-01-02T03:04:05.000Z");
  });

  test("empty capsule reads as empty array", async () => {
    const events = await run(
      Effect.gen(function* () {
        const capsule = yield* CurrentCapsule;
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
        const capsule = yield* CurrentCapsule;
        yield* capsule.artifact("plan.md", "# Plan\n\n1. Do the thing");
        return yield* capsule.readArtifact("plan.md");
      }),
    );
    expect(content).toBe("# Plan\n\n1. Do the thing");
  });

  test("overwrites existing artifact", async () => {
    const content = await run(
      Effect.gen(function* () {
        const capsule = yield* CurrentCapsule;
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
            const capsule = yield* CurrentCapsule;
            return yield* capsule.readArtifact("nonexistent.md");
          }),
        ),
        CurrentCapsuleLive("test"),
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
        const capsule = yield* CurrentCapsule;
        return capsule.id;
      }),
    );
    expect(id).toContain("test");
  });
});

describe("Capsule tools", () => {
  test("capsule tools use the execution-time Capsule service", async () => {
    const output = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          yield* Tool.callTool(logCapsuleTool, {
            type: "mission.note",
            summary: "bound at execution",
          });
          const run = yield* Tool.callTool(readCapsuleTool, { tail: 10 });
          return run.presentation.content
            .map((content) => (content._tag === "text" ? content.text : ""))
            .join("");
        }),
        Layer.merge(CurrentCapsuleLive("test"), AgentIdentityLive("agent")),
      ),
    );

    expect(output).toContain("by agent");
    expect(output).toContain("bound at execution");
  });

  test("read capsule clamps tail to the documented maximum", async () => {
    const output = await run(
      Effect.gen(function* () {
        const capsule = yield* CurrentCapsule;
        for (let i = 0; i < 60; i++) {
          yield* capsule.log({ type: "mission.note", by: "test", data: { summary: `event-${i}` } });
        }

        const run = yield* Tool.callTool(readCapsuleTool, { tail: 100 });
        const text = run.presentation.content
          .map((content) => (content._tag === "text" ? content.text : ""))
          .join("");
        return text;
      }),
    );

    expect(output.split("\n")).toHaveLength(50);
    expect(output).toContain("event-10");
    expect(output).toContain("event-59");
    expect(output).not.toContain("event-9");
  });
});
