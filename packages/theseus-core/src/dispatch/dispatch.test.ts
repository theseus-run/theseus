import { describe, expect, test } from "bun:test";
import { Duration, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Response from "effect/unstable/ai/Response";
import { type Satellite, SatelliteRingLive, TransformMessages } from "../satellite/index.ts";
import {
  makeMockLanguageModel,
  textParts,
  toolCallParts,
} from "../test-utils/mock-language-model.ts";
import { Defaults, defineTool } from "../tool/index.ts";
import { DispatchDefaults } from "./defaults.ts";
import { dispatch } from "./dispatch.ts";
import { LanguageModelGatewayFromLanguageModel } from "./model-gateway.ts";
import { CurrentDispatch, DispatchStore, InMemoryDispatchStore } from "./store.ts";
import type { DispatchSpec } from "./types.ts";

const CompleteInput = Schema.Struct({
  result: Schema.Literal("success"),
  summary: Schema.String,
});

const completeTool = defineTool({
  name: "test_complete",
  description: "Test-only completion marker for raw dispatch tests.",
  input: CompleteInput,
  output: Defaults.TextOutput,
  failure: Defaults.NoFailure,
  policy: { interaction: "pure" },
  execute: ({ summary }) => Effect.succeed(`Complete: ${summary}`),
});

const OrderInput = Schema.Struct({
  label: Schema.String,
});

const textAndToolCallParts = (
  content: string,
  calls: Array<{ id: string; name: string; arguments: string }>,
): Response.PartEncoded[] => [
  { type: "text", text: content } as Response.TextPartEncoded,
  ...toolCallParts(calls).filter((part) => part.type !== "finish"),
  ...textParts("", 10, 5).filter((part) => part.type === "finish"),
];

const modelGatewayLayer = (responses: Parameters<typeof makeMockLanguageModel>[0]) =>
  Layer.provide(LanguageModelGatewayFromLanguageModel, makeMockLanguageModel(responses));

describe("dispatch loop", () => {
  test("generates dispatch id through DispatchStore", async () => {
    const now = Date.UTC(2024, 0, 2, 3, 4, 5);
    const spec: DispatchSpec = {
      name: "runner",
      systemPrompt: "Return text.",
      tools: [],
      maxIterations: 1,
    };

    const layer = Layer.mergeAll(
      modelGatewayLayer([textParts("done")]),
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

    expect(dispatchId.startsWith(`runner-${now.toString(36)}-`)).toBe(true);
  });

  test("invalid tool input cannot become terminal success", async () => {
    const spec: DispatchSpec = {
      name: "runner",
      systemPrompt: "Call the completion tool when done.",
      tools: [completeTool],
      maxIterations: 3,
    };

    const layer = Layer.merge(
      modelGatewayLayer([
        toolCallParts([
          {
            id: "complete-1",
            name: completeTool.name,
            arguments: JSON.stringify({
              result: "invalid",
              summary: "bad",
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

  test("explicit model requests fail without a provider-backed gateway", async () => {
    const spec: DispatchSpec = {
      name: "runner",
      systemPrompt: "Return text.",
      tools: [],
      maxIterations: 1,
      modelRequest: { provider: "openai", model: "gpt-requested" },
    };

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* dispatch<never>(spec, "do it");
        return yield* Effect.flip(handle.result);
      }).pipe(
        Effect.provide(Layer.merge(modelGatewayLayer([textParts("unused")]), DispatchDefaults)),
      ),
    );

    expect(error._tag).toBe("DispatchModelFailed");
    expect(error.message).toContain("provider-backed gateway");
  });

  test("continues on tool calls while preserving assistant text in replay", async () => {
    const prompts: LanguageModel.ProviderOptions[] = [];
    const spec: DispatchSpec = {
      name: "runner",
      systemPrompt: "Call the completion tool when done.",
      tools: [completeTool],
      maxIterations: 3,
    };

    const layer = Layer.merge(
      Layer.provide(
        LanguageModelGatewayFromLanguageModel,
        makeMockLanguageModel(
          [
            textAndToolCallParts("I will report now.", [
              {
                id: "complete-1",
                name: completeTool.name,
                arguments: JSON.stringify({
                  result: "success",
                  summary: "done",
                }),
              },
            ]),
            textParts("final answer"),
          ],
          { onGenerateText: (options) => prompts.push(options) },
        ),
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
    expect(result.messages.at(-1)).toEqual({ role: "assistant", content: "final answer" });
    expect(prompts).toHaveLength(2);
    expect(
      JSON.stringify(prompts[1], (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).toContain("I will report now.");
  });

  test("executes tool calls sequentially in model order", async () => {
    const order: string[] = [];
    const firstTool = defineTool({
      name: "first_tool",
      description: "Records first execution.",
      input: OrderInput,
      output: Defaults.TextOutput,
      failure: Defaults.NoFailure,
      policy: { interaction: "pure" },
      execute: ({ label }) =>
        Effect.sleep(Duration.millis(20)).pipe(
          Effect.flatMap(() => Effect.sync(() => order.push(label))),
          Effect.as(`ok ${label}`),
        ),
    });
    const secondTool = defineTool({
      name: "second_tool",
      description: "Records second execution.",
      input: OrderInput,
      output: Defaults.TextOutput,
      failure: Defaults.NoFailure,
      policy: { interaction: "pure" },
      execute: ({ label }) => Effect.sync(() => order.push(label)).pipe(Effect.as(`ok ${label}`)),
    });
    const spec: DispatchSpec = {
      name: "runner",
      systemPrompt: "Call both tools.",
      tools: [firstTool, secondTool],
      maxIterations: 3,
    };

    const layer = Layer.merge(
      modelGatewayLayer([
        toolCallParts([
          {
            id: "first-1",
            name: firstTool.name,
            arguments: JSON.stringify({ label: "first" }),
          },
          {
            id: "second-1",
            name: secondTool.name,
            arguments: JSON.stringify({ label: "second" }),
          },
        ]),
        textParts("done"),
      ]),
      DispatchDefaults,
    );

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* dispatch<never>(spec, "do it");
        const eventsFiber = yield* handle.events.pipe(Stream.runCollect, Effect.forkChild);
        const result = yield* handle.result;
        const events = yield* Fiber.join(eventsFiber);
        return { result, events: Array.from(events) };
      }).pipe(Effect.provide(layer)),
    );

    expect(observed.result.content).toBe("done");
    expect(order).toEqual(["first", "second"]);
    expect(
      observed.events
        .filter((event) => event._tag === "ToolCalling" || event._tag === "ToolResult")
        .map((event) => `${event._tag}:${event.tool}`),
    ).toEqual([
      "ToolCalling:first_tool",
      "ToolCalling:second_tool",
      "ToolResult:first_tool",
      "ToolResult:second_tool",
    ]);
  });

  test("provides CurrentDispatch to tools", async () => {
    const currentTool = defineTool({
      name: "current_dispatch",
      description: "Reads the current dispatch context.",
      input: Defaults.NoInput,
      output: Defaults.TextOutput,
      failure: Defaults.NoFailure,
      policy: { interaction: "pure" },
      execute: () =>
        Effect.gen(function* () {
          const current = yield* CurrentDispatch;
          return `${current.name}:${current.task}:${current.id}`;
        }),
    });
    const spec: DispatchSpec<CurrentDispatch> = {
      name: "runner",
      systemPrompt: "Call current dispatch.",
      tools: [currentTool],
      maxIterations: 3,
    };

    const layer = Layer.merge(
      modelGatewayLayer([
        toolCallParts([
          {
            id: "current-1",
            name: currentTool.name,
            arguments: JSON.stringify({}),
          },
        ]),
        textParts("done"),
      ]),
      DispatchDefaults,
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* dispatch(spec, "inspect me");
        return yield* handle.result;
      }).pipe(Effect.provide(layer)),
    );

    expect(result.content).toBe("done");
  });

  test("records failed dispatches as terminal summaries", async () => {
    const spec: DispatchSpec = {
      name: "runner",
      systemPrompt: "Return text.",
      tools: [],
      maxIterations: 0,
    };

    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* dispatch<never>(spec, "do it");
        yield* Effect.flip(handle.result);
        const store = yield* DispatchStore;
        const summaries = yield* store.list();
        return summaries.find((entry) => entry.dispatchId === handle.dispatchId);
      }).pipe(Effect.provide(Layer.merge(modelGatewayLayer([]), DispatchDefaults))),
    );

    expect(summary?.status).toBe("failed");
    expect(summary?.completedAt).not.toBeNull();
  });

  test("aborts when observation-only tool checkpoints try to transform messages", async () => {
    const badCheckpoint: Satellite<void> = {
      name: "bad-checkpoint",
      open: () => Effect.void,
      checkpoint: (checkpoint) =>
        Effect.succeed({
          decision:
            checkpoint === "before-tools"
              ? TransformMessages([{ role: "system", content: "ignored" }] as const)
              : { _tag: "Pass" as const },
          state: undefined,
        }),
    };
    const spec: DispatchSpec = {
      name: "runner",
      systemPrompt: "Call completion.",
      tools: [completeTool],
      maxIterations: 3,
    };

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const handle = yield* dispatch<never>(spec, "do it");
        return yield* Effect.flip(handle.result);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            modelGatewayLayer([
              toolCallParts([
                {
                  id: "complete-1",
                  name: completeTool.name,
                  arguments: JSON.stringify({
                    result: "success",
                    summary: "done",
                  }),
                },
              ]),
            ]),
            SatelliteRingLive([badCheckpoint]),
            InMemoryDispatchStore,
          ),
        ),
      ),
    );

    expect(error._tag).toBe("DispatchInterrupted");
    if (error._tag === "DispatchInterrupted") {
      expect(error.reason).toContain("observation-only");
    }
  });
});
