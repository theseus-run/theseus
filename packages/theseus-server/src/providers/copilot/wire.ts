import type * as Response from "effect/unstable/ai/Response";

export interface TokenCache {
  readonly bearer: string;
  readonly expiresAt: number;
}

export interface ChatCompletionsWire {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ResponsesWire {
  output?: Array<{ type: string; [key: string]: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface ResponsesSSEEvent {
  type?: string;
  delta?: string;
  call_id?: string;
  item_id?: string;
  name?: string;
  arguments?: string;
  item?: { type?: string; call_id?: string; name?: string; id?: string };
}

export const shouldUseResponsesApi = (model: string): boolean => {
  const match = /^gpt-(\d+)/.exec(model);
  if (!match) return false;
  return Number(match[1]) >= 5 && !model.startsWith("gpt-5-mini");
};

/** Ensure call_id stays within OpenAI's 64-char limit. */
export const sanitizeCallId = (id: string): string => (id.length <= 64 ? id : id.slice(0, 64));

export const makeUsage = (input: number, output: number) => ({
  inputTokens: { total: input, uncached: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: undefined, reasoning: undefined },
});

export const makeFinishPart = (
  reason: string,
  input: number,
  output: number,
): Response.FinishPartEncoded => ({
  type: "finish",
  reason: reason as Response.FinishPartEncoded["reason"],
  usage: makeUsage(input, output),
  response: undefined,
});

/**
 * Effect/AI stream part encodings are intentionally quarantined here. The
 * provider is translating a foreign wire stream into Effect/AI's encoded
 * response stream shape; callers should consume the public LanguageModel API.
 */
export const streamPart = (part: unknown): Response.StreamPartEncoded =>
  part as Response.StreamPartEncoded;
