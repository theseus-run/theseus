import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { report } from "../agent-comm/report.ts";
import {
  makeMockLanguageModel,
  textParts,
  toolCallParts,
} from "../test-utils/mock-language-model.ts";
import { DispatchDefaults } from "./defaults.ts";
import { dispatch } from "./dispatch.ts";
import type { DispatchSpec } from "./types.ts";

describe("dispatch loop", () => {
  test("generates dispatch id from Effect Clock", async () => {
    const now = Date.UTC(2024, 0, 2, 3, 4, 5);
    const spec: DispatchSpec = {
      name: "worker",
      systemPrompt: "Return text.",
      tools: [],
      maxIterations: 1,
    };

    const layer = Layer.mergeAll(
      makeMockLanguageModel([textParts("done")]),
      DispatchDefaults,
      TestClock.layer(),
    );

    const dispatchId = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(now);
        const handle = yield* dispatch<never>(spec, "do it");
        return handle.dispatchId;
      }).pipe(Effect.provide(layer), Effect.scoped),
    );

    expect(dispatchId).toBe(`worker-${now.toString(36)}`);
  });

  test("invalid report input cannot become terminal success", async () => {
    const spec: DispatchSpec = {
      name: "worker",
      systemPrompt: "Report when done.",
      tools: [report],
      maxIterations: 3,
    };

    const layer = Layer.merge(
      makeMockLanguageModel([
        toolCallParts([
          {
            id: "report-1",
            name: report.name,
            arguments: JSON.stringify({
              result: "bogus",
              summary: "bad",
              content: "bad",
            }),
          },
        ]),
      ]),
      DispatchDefaults,
    );

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* dispatch<never>(spec, "do it");
        return yield* Effect.flip(handle.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(error._tag).toBe("DispatchModelFailed");
    expect(error.message).toContain("InvalidOutputError");
  });
});
