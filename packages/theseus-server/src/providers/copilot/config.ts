import { Config, ConfigProvider, Context, Effect, Layer } from "effect";

export const CopilotConfigDefaults = {
  model: "gpt-5.4",
  maxTokens: 4096,
  copilotAuthUrl: "https://api.github.com/copilot_internal/v2/token",
  copilotApiUrl: "https://api.githubcopilot.com",
} as const;

export class CopilotConfig extends Context.Service<
  CopilotConfig,
  {
    readonly model: string;
    readonly maxTokens: number;
    readonly copilotAuthUrl: string;
    readonly copilotApiUrl: string;
  }
>()("CopilotConfig") {}

export const CopilotConfigLive = Layer.effect(CopilotConfig)(
  Effect.gen(function* () {
    const provider = yield* ConfigProvider.ConfigProvider;
    return CopilotConfig.of({
      model: yield* Config.string("THESEUS_MODEL")
        .pipe(Config.withDefault(CopilotConfigDefaults.model))
        .parse(provider),
      maxTokens: yield* Config.number("THESEUS_MAX_TOKENS")
        .pipe(Config.withDefault(CopilotConfigDefaults.maxTokens))
        .parse(provider),
      copilotAuthUrl: yield* Config.string("THESEUS_COPILOT_AUTH_URL")
        .pipe(Config.withDefault(CopilotConfigDefaults.copilotAuthUrl))
        .parse(provider),
      copilotApiUrl: yield* Config.string("THESEUS_COPILOT_API_URL")
        .pipe(Config.withDefault(CopilotConfigDefaults.copilotApiUrl))
        .parse(provider),
    });
  }),
);
