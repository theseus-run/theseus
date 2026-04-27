import type * as Response from "effect/unstable/ai/Response";

export interface ResponsesWire {
  readonly output?: ReadonlyArray<{ readonly type: string; readonly [key: string]: unknown }>;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

export interface ResponsesSSEEvent {
  readonly type?: string;
  readonly delta?: string;
  readonly call_id?: string;
  readonly item_id?: string;
  readonly name?: string;
  readonly arguments?: string;
  readonly response?: {
    readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
  };
  readonly item?: {
    readonly type?: string;
    readonly call_id?: string;
    readonly id?: string;
    readonly name?: string;
    readonly arguments?: string;
  };
}

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

export const streamPart = (part: unknown): Response.StreamPartEncoded =>
  part as Response.StreamPartEncoded;
