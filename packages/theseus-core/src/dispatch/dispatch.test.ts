import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { Blueprint } from "../agent/index.ts";
import { report } from "../agent-comm/report.ts";
import { makeMockLanguageModel, toolCallParts } from "../test-utils/mock-language-model.ts";
import { DispatchDefaults } from "./defaults.ts";
import { dispatch } from "./dispatch.ts";

describe("dispatch loop", () => {
  test("invalid report input cannot become terminal success", async () => {
    const blueprint: Blueprint = {
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
        const handle = yield* dispatch<never>(blueprint, "do it");
        return yield* Effect.flip(handle.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(error._tag).toBe("AgentLLMError");
    expect(error.message).toContain("InvalidOutputError");
  });
});
