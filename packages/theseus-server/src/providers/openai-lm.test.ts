import { describe, expect, test } from "bun:test";
import { Effect, Layer, Redacted, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { OpenAIConfig } from "./openai/config.ts";
import { OpenAILanguageModelLayer } from "./openai-lm.ts";

const prompt = {
  content: [{ role: "user", content: [{ type: "text", text: "question" }] }],
} as unknown as Prompt.Prompt;

const config = OpenAIConfig.of({
  apiKey: Redacted.make("test-key"),
  apiUrl: "https://api.openai.test",
  model: "gpt-5.5",
  maxOutputTokens: 128,
  reasoningEffort: "low",
  textVerbosity: "low",
});

const mockHttpLayer = (response: Response) =>
  Layer.succeed(HttpClient.HttpClient)(
    HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, response))),
  );

const providerLayer = (response: Response) =>
  OpenAILanguageModelLayer.pipe(
    Layer.provide(mockHttpLayer(response)),
    Layer.provide(Layer.succeed(OpenAIConfig)(config)),
  );

describe("OpenAILanguageModelLayer", () => {
  test("generates text with mocked HTTP", async () => {
    const response = new Response(
      JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: "answer" }] }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }),
      { status: 200 },
    );

    const parts = await Effect.runPromise(
      Effect.gen(function* () {
        const lm = yield* LanguageModel.LanguageModel;
        return yield* lm.generateText({ prompt });
      }).pipe(Effect.provide(providerLayer(response))),
    );

    expect(parts.content.map((part) => part.type)).toEqual(["text", "finish"]);
    expect(parts.text).toBe("answer");
  });

  test("streams text with mocked HTTP", async () => {
    const bytes = new TextEncoder().encode(
      [
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "hello" })}`,
        `data: ${JSON.stringify({
          type: "response.completed",
          response: { usage: { input_tokens: 5, output_tokens: 1 } },
        })}`,
        "data: [DONE]",
        "",
      ].join("\n"),
    );
    const response = new Response(
      new ReadableStream({
        start: (controller) => {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      { status: 200 },
    );

    const parts = await Effect.runPromise(
      Effect.gen(function* () {
        const lm = yield* LanguageModel.LanguageModel;
        return yield* lm.streamText({ prompt }).pipe(Stream.runCollect);
      }).pipe(Effect.provide(providerLayer(response))),
    );

    expect(Array.from(parts).map((part) => part.type)).toEqual([
      "text-delta",
      "text-end",
      "finish",
    ]);
  });
});
