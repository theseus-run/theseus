import { describe, expect, test } from "bun:test";
import * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import type * as Prompt from "effect/unstable/ai/Prompt";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { parseLanguageModelProvider, ServerConfig, ServerConfigError } from "../config.ts";
import { CopilotConfig, CopilotConfigDefaults } from "./copilot/config.ts";
import { ServerLanguageModelGatewayLive } from "./language-model.ts";
import { LanguageModelProviderRegistryLive } from "./language-model-provider-registry.ts";
import { ModelConcurrencyLive } from "./model-concurrency.ts";
import { ModelResilienceLive } from "./model-resilience.ts";
import { OpenAIConfig, OpenAIConfigDefaults } from "./openai/config.ts";

const prompt = {
  content: [{ role: "user", content: [{ type: "text", text: "question" }] }],
} as unknown as Prompt.Prompt;

const requestBodyJson = (request: HttpClientRequest.HttpClientRequest): unknown => {
  const encoded = request.body.toJSON();
  if (typeof encoded !== "object" || encoded === null || !("body" in encoded)) {
    throw new Error("Expected encoded request body");
  }
  const body = encoded.body;
  if (typeof body !== "string") {
    throw new Error("Expected JSON request body");
  }
  return JSON.parse(body) as unknown;
};

describe("parseLanguageModelProvider", () => {
  test("defaults to copilot when unset", async () => {
    await expect(Effect.runPromise(parseLanguageModelProvider(undefined))).resolves.toBe("copilot");
    await expect(Effect.runPromise(parseLanguageModelProvider(""))).resolves.toBe("copilot");
  });

  test("accepts explicit providers", async () => {
    await expect(Effect.runPromise(parseLanguageModelProvider("copilot"))).resolves.toBe("copilot");
    await expect(Effect.runPromise(parseLanguageModelProvider("openai"))).resolves.toBe("openai");
  });

  test("rejects invalid provider names", async () => {
    await expect(Effect.runPromise(parseLanguageModelProvider("other"))).rejects.toBeInstanceOf(
      ServerConfigError,
    );
  });
});

describe("ServerLanguageModelGatewayLive", () => {
  test("honors explicit OpenAI model requests", async () => {
    let capturedBody: unknown;
    const http = HttpClient.make((request) => {
      capturedBody = requestBodyJson(request);
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              output: [{ type: "message", content: [{ type: "output_text", text: "answer" }] }],
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { status: 200 },
          ),
        ),
      );
    });

    const ProviderRegistryTestLive = Layer.provide(
      LanguageModelProviderRegistryLive,
      Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient)(http),
        TestClock.layer(),
        Layer.succeed(CopilotConfig)({
          ...CopilotConfigDefaults,
        }),
        Layer.succeed(OpenAIConfig)({
          apiKey: Redacted.make("test-key"),
          apiUrl: OpenAIConfigDefaults.apiUrl,
          model: "gpt-default",
          maxOutputTokens: OpenAIConfigDefaults.maxOutputTokens,
          reasoningEffort: undefined,
          textVerbosity: undefined,
        }),
      ),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const gateway = yield* Dispatch.LanguageModelGateway;
        const lm = yield* gateway.resolve({
          provider: "openai",
          model: "gpt-requested",
          reasoningEffort: "high",
          textVerbosity: "medium",
        });
        return yield* lm.generateText({ prompt });
      }).pipe(
        Effect.provide(
          Layer.provide(
            ServerLanguageModelGatewayLive,
            Layer.mergeAll(
              ProviderRegistryTestLive,
              ModelConcurrencyLive,
              ModelResilienceLive,
              Layer.succeed(ServerConfig)({
                port: 4800,
                languageModelProvider: "copilot",
              }),
            ),
          ),
        ),
      ),
    );

    expect(capturedBody).toMatchObject({
      model: "gpt-requested",
      reasoning: { effort: "high" },
      text: { verbosity: "medium" },
    });
  });
});
