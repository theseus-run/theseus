import { Config, ConfigProvider, Context, Effect, Layer, Option, Redacted } from "effect";

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
    readonly apiKey: Redacted.Redacted | undefined;
    readonly apiUrl: string;
    readonly model: string;
    readonly maxOutputTokens: number;
    readonly reasoningEffort: OpenAIReasoningEffort | undefined;
    readonly textVerbosity: OpenAITextVerbosity | undefined;
  }
>()("OpenAIConfig") {}

export const OpenAIConfigLive = Layer.effect(OpenAIConfig)(
  Effect.gen(function* () {
    const provider = yield* ConfigProvider.ConfigProvider;
    const apiKey = yield* Config.option(Config.string("OPENAI_API_KEY"))
      .pipe(
        Config.map((option) =>
          Option.getOrUndefined(Option.map(option, (value) => Redacted.make(value))),
        ),
      )
      .parse(provider);
    const reasoningEffort = yield* Config.option(Config.string("THESEUS_REASONING_EFFORT"))
      .pipe(
        Config.map((option) =>
          Option.getOrUndefined(
            Option.filter(option, (value): value is OpenAIReasoningEffort =>
              OpenAIReasoningEfforts.includes(value as OpenAIReasoningEffort),
            ),
          ),
        ),
      )
      .parse(provider);
    const textVerbosity = yield* Config.option(Config.string("THESEUS_TEXT_VERBOSITY"))
      .pipe(
        Config.map((option) =>
          Option.getOrUndefined(
            Option.filter(option, (value): value is OpenAITextVerbosity =>
              OpenAITextVerbosities.includes(value as OpenAITextVerbosity),
            ),
          ),
        ),
      )
      .parse(provider);

    return OpenAIConfig.of({
      apiKey,
      apiUrl: yield* Config.string("THESEUS_OPENAI_API_URL")
        .pipe(Config.withDefault(OpenAIConfigDefaults.apiUrl))
        .parse(provider),
      model: yield* Config.string("THESEUS_MODEL")
        .pipe(Config.withDefault(OpenAIConfigDefaults.model))
        .parse(provider),
      maxOutputTokens: yield* Config.number("THESEUS_MAX_OUTPUT_TOKENS")
        .pipe(
          Config.orElse(() =>
            Config.number("THESEUS_MAX_TOKENS").pipe(
              Config.withDefault(OpenAIConfigDefaults.maxOutputTokens),
            ),
          ),
        )
        .parse(provider),
      reasoningEffort,
      textVerbosity,
    });
  }),
);
