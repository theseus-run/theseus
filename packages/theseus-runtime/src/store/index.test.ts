import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Effect, Layer } from "effect";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import { TheseusDbLive } from "./sqlite.ts";
import { SqliteDispatchLog } from "./sqlite-dispatch-log.ts";
import { SqliteCapsuleLive } from "./sqlite-capsule.ts";
import { renderCapsule, renderFrictions, renderDecisions, renderTimeline } from "./capsule-render.ts";
import { unlinkSync } from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DB = "/tmp/theseus-test.db";

const dbLayer = TheseusDbLive(TEST_DB);

beforeEach(() => {
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
});

afterEach(() => {
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
});

// ===========================================================================
// SqliteDispatchLog
// ===========================================================================

describe("SqliteDispatchLog", () => {
  const logLayer = Layer.provide(SqliteDispatchLog, dbLayer);

  test("records and retrieves events", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* Dispatch.Log;
          const event: Dispatch.Event = { _tag: "Calling", agent: "test", iteration: 0 };
          yield* log.record("d-1", event);
          yield* log.record("d-1", { _tag: "Done", agent: "test", result: { result: "success", summary: "", content: "ok", usage: { inputTokens: 10, outputTokens: 5 } } });
          return yield* log.events("d-1");
        }),
        logLayer,
      ),
    );
    expect(result.length).toBe(2);
    expect(result[0]!.event._tag).toBe("Calling");
    expect(result[1]!.event._tag).toBe("Done");
    expect(result[0]!.dispatchId).toBe("d-1");
  });

  test("filters events by dispatchId", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* Dispatch.Log;
          yield* log.record("d-1", { _tag: "Calling", agent: "a", iteration: 0 });
          yield* log.record("d-2", { _tag: "Calling", agent: "b", iteration: 0 });
          const all = yield* log.events();
          const d1 = yield* log.events("d-1");
          return { all: all.length, d1: d1.length };
        }),
        logLayer,
      ),
    );
    expect(result.all).toBe(2);
    expect(result.d1).toBe(1);
  });

  test("snapshots and restores", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* Dispatch.Log;
          const msgs = [{ role: "system" as const, content: "sys" }, { role: "user" as const, content: "hi" }];
          yield* log.snapshot("d-1", 0, msgs, { inputTokens: 10, outputTokens: 5 });
          yield* log.snapshot("d-1", 1, [...msgs, { role: "assistant" as const, content: "hello" }], { inputTokens: 20, outputTokens: 10 });
          return yield* log.restore("d-1");
        }),
        logLayer,
      ),
    );
    expect(result).toBeDefined();
    expect(result!.iteration).toBe(1);
    expect(result!.messages!.length).toBe(3);
    expect(result!.usage!.inputTokens).toBe(20);
  });

  test("restore returns undefined for unknown id", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* Dispatch.Log;
          return yield* log.restore("nope");
        }),
        logLayer,
      ),
    );
    expect(result).toBeUndefined();
  });

  test("restores parentDispatchId from ParentLink event", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* Dispatch.Log;
          yield* log.record("child-1", { _tag: "Injected", agent: "worker", iteration: 0, injection: "ParentLink", detail: "parent-1" });
          yield* log.snapshot("child-1", 0, [{ role: "user" as const, content: "task" }], { inputTokens: 0, outputTokens: 0 });
          return yield* log.restore("child-1");
        }),
        logLayer,
      ),
    );
    expect(result).toBeDefined();
    expect(result!.parentDispatchId).toBe("parent-1");
  });
});

// ===========================================================================
// SqliteCapsuleLive
// ===========================================================================

describe("SqliteCapsuleLive", () => {
  const capsuleLayer = Layer.provide(SqliteCapsuleLive("test-mission"), dbLayer);

  test("logs events and reads them back", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const capsule = yield* CapsuleNs.Capsule;
          yield* capsule.log({ type: "mission.note", by: "forge", data: { message: "starting work" } });
          yield* capsule.log({ type: "mission.decide", by: "forge", data: { summary: "use grep" } });
          return yield* capsule.read();
        }),
        capsuleLayer,
      ),
    );
    expect(result.length).toBe(2);
    expect(result[0]!.type).toBe("mission.note");
    expect(result[1]!.type).toBe("mission.decide");
    expect(result[0]!.by).toBe("forge");
  });

  test("writes and reads artifacts", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const capsule = yield* CapsuleNs.Capsule;
          yield* capsule.artifact("plan.md", "# Plan\n\nDo stuff.");
          return yield* capsule.readArtifact("plan.md");
        }),
        capsuleLayer,
      ),
    );
    expect(result).toBe("# Plan\n\nDo stuff.");
  });

  test("artifact overwrites on conflict", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const capsule = yield* CapsuleNs.Capsule;
          yield* capsule.artifact("plan.md", "v1");
          yield* capsule.artifact("plan.md", "v2");
          return yield* capsule.readArtifact("plan.md");
        }),
        capsuleLayer,
      ),
    );
    expect(result).toBe("v2");
  });

  test("readArtifact fails for missing name", async () => {
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const capsule = yield* CapsuleNs.Capsule;
          return yield* Effect.flip(capsule.readArtifact("nope"));
        }),
        capsuleLayer,
      ),
    );
    expect(err._tag).toBe("CapsuleError");
  });

  test("capsule has an id", async () => {
    const id = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const capsule = yield* CapsuleNs.Capsule;
          return capsule.id;
        }),
        capsuleLayer,
      ),
    );
    expect(id).toContain("test-mission");
  });
});

// ===========================================================================
// Capsule render functions
// ===========================================================================

describe("renderCapsule", () => {
  const events: CapsuleNs.Event[] = [
    { type: "mission.note", at: "2026-04-11T10:00:00Z", by: "forge", data: { message: "started" } },
    { type: "mission.decide", at: "2026-04-11T10:01:00Z", by: "forge", data: { summary: "use ripgrep for search" } },
    { type: "mission.friction", at: "2026-04-11T10:02:00Z", by: "forge", data: { summary: "tsc took 30s" } },
    { type: "agent.dispatch", at: "2026-04-11T10:03:00Z", by: "orchestrator", data: { task: "fix the bug" } },
    { type: "agent.result", at: "2026-04-11T10:05:00Z", by: "worker", data: { result: "success", summary: "bug fixed" } },
    { type: "mission.learning", at: "2026-04-11T10:06:00Z", by: "forge", data: { message: "grep is faster than find" } },
  ];

  test("renderFrictions outputs friction events", () => {
    const md = renderFrictions(events);
    expect(md).toContain("## Frictions");
    expect(md).toContain("tsc took 30s");
  });

  test("renderFrictions shows 'None' when empty", () => {
    expect(renderFrictions([])).toContain("None recorded");
  });

  test("renderDecisions outputs decision events", () => {
    const md = renderDecisions(events);
    expect(md).toContain("## Key Decisions");
    expect(md).toContain("use ripgrep for search");
  });

  test("renderTimeline shows all events in table", () => {
    const md = renderTimeline(events);
    expect(md).toContain("## Timeline");
    expect(md).toContain("| Time |");
    expect(md).toContain("mission.note");
    expect(md).toContain("mission.decide");
    expect(md).toContain("agent.dispatch");
  });

  test("renderCapsule produces full report with all sections", () => {
    const md = renderCapsule(events);
    expect(md).toContain("# Mission Capsule");
    expect(md).toContain("## Timeline");
    expect(md).toContain("## Key Decisions");
    expect(md).toContain("## Frictions");
    expect(md).toContain("## Notes & Learnings");
    expect(md).toContain("## Agent Activity");
  });

  test("renderCapsule omits empty sections", () => {
    const minimal: CapsuleNs.Event[] = [
      { type: "mission.note", at: "2026-04-11T10:00:00Z", by: "forge", data: { message: "hello" } },
    ];
    const md = renderCapsule(minimal);
    expect(md).toContain("## Timeline");
    expect(md).toContain("None recorded"); // frictions and decisions empty
    expect(md).not.toContain("## Agent Activity");
    expect(md).not.toContain("## Concerns");
  });
});
