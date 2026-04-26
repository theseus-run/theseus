import { describe, expect, test } from "bun:test";
import { Deferred, Effect, Ref } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { backgroundSatellite } from "./background.ts";
import { makeSatelliteRing } from "./ring.ts";
import { Pass, TransformMessages } from "./types.ts";

const ctx = { dispatchId: "d", name: "runner", task: "task", iteration: 0 };

const readText = (messages: ReadonlyArray<Prompt.MessageEncoded>): string =>
  messages
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n");

describe("backgroundSatellite", () => {
  test("starts work without blocking and applies the completed result later", async () => {
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        const satellite = backgroundSatellite({
          name: "lazy-context",
          shouldStart: (checkpoint) => (checkpoint === "iteration-start" ? "scan" : null),
          work: (input: string) => Effect.succeed(`result:${input}`),
          toDecision: (result) => TransformMessages([{ role: "system", content: result }] as const),
        });
        const ring = yield* makeSatelliteRing([satellite]);
        const scope = yield* ring.openScope({ dispatchId: "d", name: "runner", task: "task" });

        const first = yield* scope.checkpoint("iteration-start", ctx);
        yield* Effect.yieldNow;
        const second = yield* scope.checkpoint("iteration-start", ctx);
        yield* scope.close;

        expect(first).toEqual(Pass);
        return second;
      }),
    );

    expect(decision._tag).toBe("TransformMessages");
    if (decision._tag === "TransformMessages") {
      expect(readText(decision.messages)).toBe("result:scan");
    }
  });

  test("passes while background work is still pending", async () => {
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const satellite = backgroundSatellite({
          name: "pending",
          shouldStart: (checkpoint) => (checkpoint === "iteration-start" ? "scan" : null),
          work: () => Deferred.await(gate),
          toDecision: () => TransformMessages([{ role: "system", content: "done" }] as const),
        });
        const ring = yield* makeSatelliteRing([satellite]);
        const scope = yield* ring.openScope({ dispatchId: "d", name: "runner", task: "task" });

        yield* scope.checkpoint("iteration-start", ctx);
        const pending = yield* scope.checkpoint("iteration-start", ctx);
        yield* scope.close;
        return pending;
      }),
    );

    expect(decision).toEqual(Pass);
  });

  test("maps typed background failures through onFailure", async () => {
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        const satellite = backgroundSatellite({
          name: "scanner",
          shouldStart: (checkpoint) => (checkpoint === "iteration-start" ? "scan" : null),
          work: () => Effect.fail("denied"),
          toDecision: () => Pass,
          onFailure: (error: string) =>
            Effect.succeed(TransformMessages([{ role: "system", content: error }] as const)),
        });
        const ring = yield* makeSatelliteRing([satellite]);
        const scope = yield* ring.openScope({ dispatchId: "d", name: "runner", task: "task" });

        yield* scope.checkpoint("iteration-start", ctx);
        yield* Effect.yieldNow;
        const mapped = yield* scope.checkpoint("iteration-start", ctx);
        yield* scope.close;
        return mapped;
      }),
    );

    expect(decision._tag).toBe("TransformMessages");
    if (decision._tag === "TransformMessages") {
      expect(readText(decision.messages)).toBe("denied");
    }
  });

  test("aborts by default when background work fails", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const satellite = backgroundSatellite({
          name: "scanner",
          shouldStart: (checkpoint) => (checkpoint === "iteration-start" ? "scan" : null),
          work: () => Effect.fail("denied"),
          toDecision: () => Pass,
        });
        const ring = yield* makeSatelliteRing([satellite]);
        const scope = yield* ring.openScope({ dispatchId: "d", name: "runner", task: "task" });

        yield* scope.checkpoint("iteration-start", ctx);
        yield* Effect.yieldNow;
        return yield* Effect.flip(scope.checkpoint("iteration-start", ctx));
      }),
    );

    expect(error._tag).toBe("SatelliteAbort");
    expect(error.satellite).toBe("scanner");
  });

  test("close interrupts active background work", async () => {
    const interrupted = await Effect.runPromise(
      Effect.gen(function* () {
        const closed = yield* Ref.make(false);
        const satellite = backgroundSatellite({
          name: "closer",
          shouldStart: (checkpoint) => (checkpoint === "iteration-start" ? "scan" : null),
          work: () => Effect.never.pipe(Effect.ensuring(Ref.set(closed, true))),
          toDecision: () => Pass,
        });
        const ring = yield* makeSatelliteRing([satellite]);
        const scope = yield* ring.openScope({ dispatchId: "d", name: "runner", task: "task" });

        yield* scope.checkpoint("iteration-start", ctx);
        yield* Effect.yieldNow;
        yield* scope.close;
        return yield* Ref.get(closed);
      }),
    );

    expect(interrupted).toBe(true);
  });
});
