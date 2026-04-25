import { describe, expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import type * as Response from "effect/unstable/ai/Response";
import {
  makeMockLanguageModel,
  textParts,
  toolCallParts,
} from "../test-utils/mock-language-model.ts";
import { Defaults, defineTool } from "../tool/index.ts";
import { step } from "./step.ts";

const NoopInput = Schema.Struct({
  value: Schema.String,
});

const noopTool = defineTool({
  name: "noop_tool",
  description: "No-op tool for step characterization.",
  input: NoopInput,
  output: Defaults.TextOutput,
  failure: Defaults.NoFailure,
  policy: { interaction: "pure" },
  execute: ({ value }) => Effect.succeed(value),
});

const messages = [
  { role: "system" as const, content: "You are concise." },
  { role: "user" as const, content: "Do the thing." },
];

const reasoningParts = (
  thinking: string,
  content: string,
  inputTokens = 13,
  outputTokens = 7,
): Response.PartEncoded[] => [
  { type: "reasoning", text: thinking } as Response.ReasoningPartEncoded,
  ...textParts(content, inputTokens, outputTokens),
];

const textAndToolCallParts = (
  content: string,
  calls: Array<{ id: string; name: string; arguments: string }>,
  inputTokens = 21,
  outputTokens = 8,
): Response.PartEncoded[] => [
  { type: "text", text: content } as Response.TextPartEncoded,
  ...toolCallParts(calls, inputTokens, outputTokens).filter((part) => part.type !== "finish"),
  ...textParts("", inputTokens, outputTokens).filter((part) => part.type === "finish"),
];

const runStep = (parts: Response.PartEncoded[]) =>
  Effect.runPromise(
    step(messages, [noopTool], "dispatch-1", "runner").pipe(
      Effect.provide(Layer.merge(makeMockLanguageModel([parts]), Layer.empty)),
    ),
  );

describe("step", () => {
  test("returns text-only content, no tool calls, and usage", async () => {
    const result = await runStep(textParts("plain answer", 11, 4));

    expect(result.content).toBe("plain answer");
    expect(result.thinking).toBeUndefined();
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
  });

  test("preserves reasoning text as thinking", async () => {
    const result = await runStep(reasoningParts("private reasoning", "public answer", 12, 6));

    expect(result.content).toBe("public answer");
    expect(result.thinking).toBe("private reasoning");
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 6 });
  });

  test("preserves mixed assistant text and tool call params", async () => {
    const result = await runStep(
      textAndToolCallParts("I will use a tool.", [
        {
          id: "call-1",
          name: noopTool.name,
          arguments: JSON.stringify({ value: "alpha" }),
        },
      ]),
    );

    expect(result.content).toBe("I will use a tool.");
    expect(result.toolCalls).toEqual([
      {
        id: "call-1",
        name: noopTool.name,
        arguments: JSON.stringify({ value: "alpha" }),
      },
    ]);
  });

  test("preserves multiple tool calls in model order", async () => {
    const result = await runStep(
      toolCallParts(
        [
          {
            id: "call-1",
            name: noopTool.name,
            arguments: JSON.stringify({ value: "first" }),
          },
          {
            id: "call-2",
            name: noopTool.name,
            arguments: JSON.stringify({ value: "second" }),
          },
        ],
        31,
        9,
      ),
    );

    expect(result.content).toBe("");
    expect(result.toolCalls.map((call) => call.id)).toEqual(["call-1", "call-2"]);
    expect(result.toolCalls.map((call) => call.arguments)).toEqual([
      JSON.stringify({ value: "first" }),
      JSON.stringify({ value: "second" }),
    ]);
    expect(result.usage).toEqual({ inputTokens: 31, outputTokens: 9 });
  });
});
