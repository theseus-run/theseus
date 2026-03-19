/**
 * Runtime configuration — read from environment variables with safe defaults.
 *
 * Variables:
 *   THESEUS_MODEL            — Copilot model name (default: "gpt-4o")
 *   THESEUS_MAX_TOKENS       — Max tokens per LLM response (default: 4096)
 *   THESEUS_SHELL_MAX_OUTPUT — Max shell output bytes before truncation (default: 8192)
 */

const env = (key: string): string | undefined => process.env[key];

const envInt = (key: string, fallback: number): number => {
  const v = env(key);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const Config = {
  /** Copilot chat model identifier */
  model: env("THESEUS_MODEL") ?? "gpt-5.4",

  /** Maximum tokens the LLM may return per request */
  maxTokens: envInt("THESEUS_MAX_TOKENS", 4096),

  /** Maximum shell output bytes returned to the model before truncation */
  shellMaxOutput: envInt("THESEUS_SHELL_MAX_OUTPUT", 8192),
} as const;
