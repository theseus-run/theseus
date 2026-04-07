import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Capsule } from "../capsule/index.ts";
import { MissionId } from "./id.ts";
import { isValidTransition, deriveStatus } from "./status.ts";
import { MissionErrorInvalidTransition } from "./index.ts";
import { MissionContext } from "./context.ts";
import { MissionLive } from "./layer.ts";

// ===========================================================================
// MissionId
// ===========================================================================

describe("MissionId", () => {
  test("format: NANOID7-date-slug", () => {
    const id = MissionId("fix-auth-bug");
    expect(id).toMatch(/^[A-Z0-9]{7}-\d{4}-\d{2}-\d{2}-fix-auth-bug$/);
  });

  test("slug is optional", () => {
    const id = MissionId();
    expect(id).toMatch(/^[A-Z0-9]{7}-\d{4}-\d{2}-\d{2}$/);
  });
});

// ===========================================================================
// State machine — isValidTransition
// ===========================================================================

describe("isValidTransition", () => {
  test("pending → running (approval gate)", () => {
    expect(isValidTransition("pending", "running")).toBe(true);
  });

  test("pending → cancelled", () => {
    expect(isValidTransition("pending", "cancelled")).toBe(true);
  });

  test("running → done", () => {
    expect(isValidTransition("running", "done")).toBe(true);
  });

  test("running → failed", () => {
    expect(isValidTransition("running", "failed")).toBe(true);
  });

  test("running → cancelled", () => {
    expect(isValidTransition("running", "cancelled")).toBe(true);
  });

  test("failed → running (retry)", () => {
    expect(isValidTransition("failed", "running")).toBe(true);
  });

  test("done is terminal", () => {
    expect(isValidTransition("done", "running")).toBe(false);
    expect(isValidTransition("done", "pending")).toBe(false);
  });

  test("cancelled is terminal", () => {
    expect(isValidTransition("cancelled", "running")).toBe(false);
  });

  test("pending → done is invalid (must go through running)", () => {
    expect(isValidTransition("pending", "done")).toBe(false);
  });

  test("pending → failed is invalid", () => {
    expect(isValidTransition("pending", "failed")).toBe(false);
  });
});

// ===========================================================================
// deriveStatus — reconstruct from events
// ===========================================================================

describe("deriveStatus", () => {
  test("empty events → pending", () => {
    expect(deriveStatus([])).toBe("pending");
  });

  test("single transition → that status", () => {
    expect(deriveStatus([
      { type: "mission.create", at: "2026-04-07T00:00:00Z", by: "runtime", data: {} },
      { type: "mission.transition", at: "2026-04-07T00:01:00Z", by: "runtime", data: { from: "pending", to: "running" } },
    ])).toBe("running");
  });

  test("multiple transitions → last valid status", () => {
    expect(deriveStatus([
      { type: "mission.transition", at: "t1", by: "runtime", data: { from: "pending", to: "running" } },
      { type: "mission.transition", at: "t2", by: "runtime", data: { from: "running", to: "failed" } },
      { type: "mission.transition", at: "t3", by: "runtime", data: { from: "failed", to: "running" } },
    ])).toBe("running");
  });

  test("ignores non-transition events", () => {
    expect(deriveStatus([
      { type: "mission.create", at: "t1", by: "runtime", data: {} },
      { type: "mission.plan", at: "t2", by: "theseus", data: {} },
      { type: "mission.friction", at: "t3", by: "forge", data: {} },
    ])).toBe("pending");
  });

  test("ignores invalid status values in events", () => {
    expect(deriveStatus([
      { type: "mission.transition", at: "t1", by: "runtime", data: { from: "pending", to: "BOGUS" } },
    ])).toBe("pending");
  });
});

// ===========================================================================
// MissionLive — layer composition
// ===========================================================================

const missionConfig = {
  id: MissionId("test-mission"),
  goal: "Test the mission system",
  criteria: ["All tests pass", "Types are clean"],
};

const runMission = <A>(effect: Effect.Effect<A, any, MissionContext | Capsule>) =>
  Effect.runPromise(Effect.provide(effect, MissionLive(missionConfig)));

describe("MissionLive — creation", () => {
  test("mission starts in pending status", async () => {
    const mission = await runMission(
      Effect.gen(function* () {
        const ctx = yield* MissionContext;
        return yield* ctx.mission;
      }),
    );
    expect(mission.status).toBe("pending");
    expect(mission.goal).toBe("Test the mission system");
    expect(mission.criteria).toEqual(["All tests pass", "Types are clean"]);
    expect(mission.createdAt).toBeTruthy();
  });

  test("auto-logs mission.create event to Capsule", async () => {
    const events = await runMission(
      Effect.gen(function* () {
        const capsule = yield* Capsule;
        return yield* capsule.read();
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("mission.create");
    expect(events[0]!.by).toBe("runtime");
    expect((events[0]!.data as any).goal).toBe("Test the mission system");
  });
});

describe("MissionLive — transitions", () => {
  test("pending → running succeeds", async () => {
    const status = await runMission(
      Effect.gen(function* () {
        const ctx = yield* MissionContext;
        yield* ctx.transition("running");
        const m = yield* ctx.mission;
        return m.status;
      }),
    );
    expect(status).toBe("running");
  });

  test("transition logs event to Capsule", async () => {
    const events = await runMission(
      Effect.gen(function* () {
        const ctx = yield* MissionContext;
        const capsule = yield* Capsule;
        yield* ctx.transition("running");
        return yield* capsule.read();
      }),
    );
    const transitionEvents = events.filter((e) => e.type === "mission.transition");
    expect(transitionEvents).toHaveLength(1);
    expect((transitionEvents[0]!.data as any).from).toBe("pending");
    expect((transitionEvents[0]!.data as any).to).toBe("running");
  });

  test("invalid transition fails with MissionErrorInvalidTransition", async () => {
    const error = await Effect.runPromise(
      Effect.provide(
        Effect.flip(
          Effect.gen(function* () {
            const ctx = yield* MissionContext;
            yield* ctx.transition("done"); // pending → done is invalid
          }),
        ),
        MissionLive(missionConfig),
      ),
    );
    expect(error).toBeInstanceOf(MissionErrorInvalidTransition);
    expect((error as MissionErrorInvalidTransition).from).toBe("pending");
    expect((error as MissionErrorInvalidTransition).to).toBe("done");
  });

  test("full lifecycle: pending → running → done", async () => {
    const result = await runMission(
      Effect.gen(function* () {
        const ctx = yield* MissionContext;
        const capsule = yield* Capsule;

        yield* ctx.transition("running");
        yield* ctx.transition("done");

        const mission = yield* ctx.mission;
        const events = yield* capsule.read();
        return { mission, events };
      }),
    );

    expect(result.mission.status).toBe("done");
    expect(result.events.map((e) => e.type)).toEqual([
      "mission.create",
      "mission.transition",  // pending → running
      "mission.transition",  // running → done
    ]);
  });

  test("failed → running (retry)", async () => {
    const status = await runMission(
      Effect.gen(function* () {
        const ctx = yield* MissionContext;
        yield* ctx.transition("running");
        yield* ctx.transition("failed");
        yield* ctx.transition("running"); // retry
        const m = yield* ctx.mission;
        return m.status;
      }),
    );
    expect(status).toBe("running");
  });
});

// ===========================================================================
// Plan artifact pattern
// ===========================================================================

describe("Plan artifact flow", () => {
  test("write plan during pending, read during running", async () => {
    const plan = await runMission(
      Effect.gen(function* () {
        const ctx = yield* MissionContext;
        const capsule = yield* Capsule;

        // Pending phase: write plan artifact
        yield* capsule.artifact("plan.md", "# Plan\n\n1. Fix the bug\n2. Add tests");
        yield* capsule.log({ type: "mission.plan", by: "theseus", data: { path: "plan.md" } });

        // Approval gate
        yield* ctx.transition("running");

        // Execution phase: read plan back
        return yield* capsule.readArtifact("plan.md");
      }),
    );

    expect(plan).toBe("# Plan\n\n1. Fix the bug\n2. Add tests");
  });
});
