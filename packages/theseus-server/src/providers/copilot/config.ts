import { Context, Layer } from "effect";

export class CopilotConfig extends Context.Service<
  CopilotConfig,
  {
    readonly model: string;
    readonly maxTokens: number;
    readonly copilotAuthUrl: string;
    readonly copilotApiUrl: string;
  }
>()("CopilotConfig") {}

const env = (key: string): string | undefined => process.env[key];

const envInt = (key: string, fallback: number): number => {
  const value = env(key);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const CopilotConfigLive = Layer.succeed(CopilotConfig)({
  model: env("THESEUS_MODEL") ?? "gpt-5.4",
  maxTokens: envInt("THESEUS_MAX_TOKENS", 4096),
  copilotAuthUrl:
    env("THESEUS_COPILOT_AUTH_URL") ?? "https://api.github.com/copilot_internal/v2/token",
  copilotApiUrl: env("THESEUS_COPILOT_API_URL") ?? "https://api.githubcopilot.com",
});
