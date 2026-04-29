import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";
import { CopilotConfig, CopilotConfigDefaults, CopilotConfigLive } from "./copilot/config.ts";
import { OpenAIConfig, OpenAIConfigDefaults, OpenAIConfigLive } from "./openai/config.ts";

const envLayer = (values: Readonly<Record<string, string>>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: values }));

describe("provider config resolution", () => {
  test("resolves Copilot defaults through Effect Config", async () => {
    const config = await Effect.runPromise(
      Effect.service(CopilotConfig).pipe(
        Effect.provide(Layer.provide(CopilotConfigLive, envLayer({}))),
      ),
    );

    expect(config).toEqual(CopilotConfigDefaults);
  });

  test("resolves OpenAI defaults through Effect Config", async () => {
    const config = await Effect.runPromise(
      Effect.service(OpenAIConfig).pipe(
        Effect.provide(Layer.provide(OpenAIConfigLive, envLayer({}))),
      ),
    );

    expect(config).toMatchObject({
      apiKey: undefined,
      apiUrl: OpenAIConfigDefaults.apiUrl,
      model: OpenAIConfigDefaults.model,
      maxOutputTokens: OpenAIConfigDefaults.maxOutputTokens,
      reasoningEffort: undefined,
      textVerbosity: undefined,
    });
  });

  test("resolves OpenAI overrides through Effect Config", async () => {
    const config = await Effect.runPromise(
      Effect.service(OpenAIConfig).pipe(
        Effect.provide(
          Layer.provide(
            OpenAIConfigLive,
            envLayer({
              OPENAI_API_KEY: "test-key",
              THESEUS_OPENAI_API_URL: "https://api.openai.test",
              THESEUS_MODEL: "gpt-test",
              THESEUS_MAX_OUTPUT_TOKENS: "512",
              THESEUS_REASONING_EFFORT: "high",
              THESEUS_TEXT_VERBOSITY: "medium",
            }),
          ),
        ),
      ),
    );

    expect(config).toEqual({
      apiKey: Redacted.make("test-key"),
      apiUrl: "https://api.openai.test",
      model: "gpt-test",
      maxOutputTokens: 512,
      reasoningEffort: "high",
      textVerbosity: "medium",
    });
  });
});
