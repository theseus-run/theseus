import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Response from "effect/unstable/ai/Response";
import { report } from "../agent-comm/report.ts";
import {
  makeMockLanguageModel,
  textParts,
  toolCallParts,
} from "../test-utils/mock-language-model.ts";
import { DispatchDefaults } from "./defaults.ts";
import { dispatch } from "./dispatch.ts";
import type { DispatchSpec } from "./types.ts";

const textAndToolCallParts = (
  content: string,
  calls: Array<{ id: string; name: string; arguments: string }>,
): Response.PartEncoded[] => [
  { type: "text", text: content } as Response.TextPartEncoded,
  ...toolCallParts(calls).filter((part) => part.type !== "finish"),
  ...textParts("", 10, 5).filter((part) => part.type === "finish"),
];

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

  test("continues on tool calls while preserving assistant text in replay", async () => {
    const prompts: LanguageModel.ProviderOptions[] = [];
    const spec: DispatchSpec = {
      name: "worker",
      systemPrompt: "Report when done.",
      tools: [report],
      maxIterations: 3,
    };

    const layer = Layer.merge(
      makeMockLanguageModel(
        [
          textAndToolCallParts("I will report now.", [
            {
              id: "report-1",
              name: report.name,
              arguments: JSON.stringify({
                result: "success",
                summary: "done",
                content: "summary text",
              }),
            },
          ]),
          textParts("final answer"),
        ],
        { onGenerateText: (options) => prompts.push(options) },
      ),
      DispatchDefaults,
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* dispatch<never>(spec, "do it");
        return yield* handle.result;
      }).pipe(Effect.provide(layer)),
    );

    expect(result.content).toBe("final answer");
    expect(prompts).toHaveLength(2);
    expect(
      JSON.stringify(prompts[1], (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).toContain("I will report now.");
  });
});
