import { Context, Effect, Layer } from "effect";
import { getEnvInt, ServerEnv } from "../../env.ts";

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
    const env = yield* ServerEnv;
    return CopilotConfig.of({
      model: env.get("THESEUS_MODEL") ?? CopilotConfigDefaults.model,
      maxTokens: getEnvInt(env, "THESEUS_MAX_TOKENS", CopilotConfigDefaults.maxTokens),
      copilotAuthUrl: env.get("THESEUS_COPILOT_AUTH_URL") ?? CopilotConfigDefaults.copilotAuthUrl,
      copilotApiUrl: env.get("THESEUS_COPILOT_API_URL") ?? CopilotConfigDefaults.copilotApiUrl,
    });
  }),
);
