import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { AgentIdentityLive } from "../agent/index.ts";
import * as Tool from "../Tool.ts";
import { Capsule, CapsuleError, makeCapsuleId } from "./index.ts";
import { CapsuleLive } from "./memory.ts";
import { logCapsuleTool, readCapsuleTool } from "./tools.ts";

const run = <A>(effect: Effect.Effect<A, unknown, Capsule>) =>
  Effect.runPromise(Effect.provide(effect, CapsuleLive("test")));

describe("makeCapsuleId", () => {
  test("includes slug and date components", async () => {
    const id = await Effect.runPromise(makeCapsuleId("my-mission"));
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

describe("Capsule tools", () => {
  test("capsule tools use the execution-time Capsule service", async () => {
    const output = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          yield* Tool.callTool(logCapsuleTool, {
            type: "mission.note",
            summary: "bound at execution",
          });
          const presentation = yield* Tool.callTool(readCapsuleTool, { tail: 10 });
          return presentation.content
            .map((content) => (content._tag === "text" ? content.text : ""))
            .join("");
        }),
        Layer.merge(CapsuleLive("test"), AgentIdentityLive("agent")),
      ),
    );

    expect(output).toContain("by agent");
    expect(output).toContain("bound at execution");
  });

  test("read capsule clamps tail to the documented maximum", async () => {
    const output = await run(
      Effect.gen(function* () {
        const capsule = yield* Capsule;
        for (let i = 0; i < 60; i++) {
          yield* capsule.log({ type: "mission.note", by: "test", data: { summary: `event-${i}` } });
        }

        const presentation = yield* Tool.callTool(readCapsuleTool, { tail: 100 });
        const text = presentation.content
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
