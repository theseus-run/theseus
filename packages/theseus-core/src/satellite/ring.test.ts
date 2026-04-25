import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { StepResult } from "../dispatch/types.ts";
import { makeSatelliteRing } from "./ring.ts";
import type { Satellite } from "./types.ts";
import { TransformStepResult } from "./types.ts";

const stepResult = (inputTokens: number, outputTokens: number): StepResult => ({
  content: "",
  toolCalls: [],
  usage: { inputTokens, outputTokens },
});

describe("SatelliteRing", () => {
  test("opens dispatch-scoped satellite state", async () => {
    const budget: Satellite<number> = {
      name: "budget",
      open: () => Effect.succeed(0),
      afterCall: (phase, _ctx, state) => {
        const next =
          state + phase.stepResult.usage.inputTokens + phase.stepResult.usage.outputTokens;
        return Effect.succeed({
          decision: TransformStepResult({ ...phase.stepResult, content: String(next) }),
          state: next,
        });
      },
    };

    const states = await Effect.runPromise(
      Effect.gen(function* () {
        const ring = yield* makeSatelliteRing([budget]);
        const first = yield* ring.openScope({ dispatchId: "a", name: "runner", task: "one" });
        const second = yield* ring.openScope({ dispatchId: "b", name: "runner", task: "two" });

        yield* first.afterCall(
          { stepResult: stepResult(2, 3) },
          { dispatchId: "a", name: "runner", task: "one", iteration: 0 },
        );
        yield* second.afterCall(
          { stepResult: stepResult(7, 11) },
          { dispatchId: "b", name: "runner", task: "two", iteration: 0 },
        );

        const firstAgain = yield* first.afterCall(
          { stepResult: stepResult(1, 1) },
          { dispatchId: "a", name: "runner", task: "one", iteration: 1 },
        );
        yield* first.close;
        yield* second.close;
        return firstAgain;
      }),
    );

    expect(states._tag).toBe("TransformStepResult");
    if (states._tag === "TransformStepResult") {
      expect(states.stepResult.content).toBe("7");
    }
  });
});
