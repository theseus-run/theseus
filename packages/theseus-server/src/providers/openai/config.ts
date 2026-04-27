import { Context, Effect, Layer } from "effect";
import { getEnvInt, getEnvOption, ServerEnv } from "../../env.ts";

export type OpenAIReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type OpenAITextVerbosity = "low" | "medium" | "high";

export const OpenAIConfigDefaults = {
  apiUrl: "https://api.openai.com",
  model: "gpt-5.5",
  maxOutputTokens: 4096,
} as const;

export const OpenAIReasoningEfforts = [
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies ReadonlyArray<OpenAIReasoningEffort>;

export const OpenAITextVerbosities = [
  "low",
  "medium",
  "high",
] as const satisfies ReadonlyArray<OpenAITextVerbosity>;

export class OpenAIConfig extends Context.Service<
  OpenAIConfig,
  {
    readonly apiKey: string | undefined;
    readonly apiUrl: string;
    readonly model: string;
    readonly maxOutputTokens: number;
    readonly reasoningEffort: OpenAIReasoningEffort | undefined;
    readonly textVerbosity: OpenAITextVerbosity | undefined;
  }
>()("OpenAIConfig") {}

export const OpenAIConfigLive = Layer.effect(OpenAIConfig)(
  Effect.gen(function* () {
    const env = yield* ServerEnv;
    return OpenAIConfig.of({
      apiKey: env.get("OPENAI_API_KEY"),
      apiUrl: env.get("THESEUS_OPENAI_API_URL") ?? OpenAIConfigDefaults.apiUrl,
      model: env.get("THESEUS_MODEL") ?? OpenAIConfigDefaults.model,
      maxOutputTokens: getEnvInt(
        env,
        "THESEUS_MAX_OUTPUT_TOKENS",
        getEnvInt(env, "THESEUS_MAX_TOKENS", OpenAIConfigDefaults.maxOutputTokens),
      ),
      reasoningEffort: getEnvOption(env, "THESEUS_REASONING_EFFORT", OpenAIReasoningEfforts),
      textVerbosity: getEnvOption(env, "THESEUS_TEXT_VERBOSITY", OpenAITextVerbosities),
    });
  }),
);
