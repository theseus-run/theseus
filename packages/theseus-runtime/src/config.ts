/**
 * RuntimeConfig — Effect service for runtime configuration.
 *
 * Replaces the plain Config object with a proper Effect ServiceMap.Service
 * so configuration is injectable and testable via Effect DI.
 *
 * Variables:
 *   THESEUS_MODEL            — Copilot model name (default: "gpt-5.4")
 *   THESEUS_MAX_TOKENS       — Max tokens per LLM response (default: 4096)
 *   THESEUS_SHELL_MAX_OUTPUT — Max shell output bytes before truncation (default: 8192)
 *   THESEUS_COPILOT_AUTH_URL — Copilot auth endpoint
 *   THESEUS_COPILOT_API_URL  — Copilot API base URL
 */

import { Layer, ServiceMap } from "effect";

// ---------------------------------------------------------------------------
// RuntimeConfig — Effect service for configuration
// ---------------------------------------------------------------------------

export class RuntimeConfig extends ServiceMap.Service<
  RuntimeConfig,
  {
    readonly model: string;
    readonly maxTokens: number;
    readonly shellMaxOutput: number;
    readonly copilotAuthUrl: string;
    readonly copilotApiUrl: string;
  }
>()("RuntimeConfig") {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const env = (key: string): string | undefined => process.env[key];

const envInt = (key: string, fallback: number): number => {
  const v = env(key);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------
// RuntimeConfigLive — reads from process.env with defaults
// ---------------------------------------------------------------------------

export const RuntimeConfigLive = Layer.succeed(RuntimeConfig, {
  model: env("THESEUS_MODEL") ?? "gpt-5.4",
  maxTokens: envInt("THESEUS_MAX_TOKENS", 4096),
  shellMaxOutput: envInt("THESEUS_SHELL_MAX_OUTPUT", 8192),
  copilotAuthUrl:
    env("THESEUS_COPILOT_AUTH_URL") ??
    "https://api.github.com/copilot_internal/v2/token",
  copilotApiUrl:
    env("THESEUS_COPILOT_API_URL") ?? "https://api.githubcopilot.com",
});

// ---------------------------------------------------------------------------
// Backward compat — keep existing Config export for now (deprecated)
// ---------------------------------------------------------------------------

/** @deprecated Use RuntimeConfig service instead */
export const Config = {
  model: env("THESEUS_MODEL") ?? "gpt-5.4",
  maxTokens: envInt("THESEUS_MAX_TOKENS", 4096),
  shellMaxOutput: envInt("THESEUS_SHELL_MAX_OUTPUT", 8192),
  copilotAuthUrl:
    env("THESEUS_COPILOT_AUTH_URL") ??
    "https://api.github.com/copilot_internal/v2/token",
  copilotApiUrl:
    env("THESEUS_COPILOT_API_URL") ?? "https://api.githubcopilot.com",
} as const;
