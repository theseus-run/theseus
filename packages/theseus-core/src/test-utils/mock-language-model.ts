/**
 * Mock LanguageModel for tests.
 *
 * Accepts an array of MockResponse values (each a Response.PartEncoded[]).
 * Returns them in sequence on each generateText/streamText call.
 *
 * The generateText path returns PartEncoded[] directly.
 * The streamText path converts PartEncoded[] to StreamPartEncoded[].
 */

import { Effect, Layer, Ref, Stream } from "effect";
import * as AiError from "effect/unstable/ai/AiError";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Response from "effect/unstable/ai/Response";

// ---------------------------------------------------------------------------
// Usage helper
// ---------------------------------------------------------------------------

const makeUsage = (input: number, output: number) => ({
  inputTokens: { total: input, uncached: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: undefined, reasoning: undefined },
});

const finishPart = (reason: Response.FinishPartEncoded["reason"], input: number, output: number) =>
  ({
    type: "finish",
    reason,
    usage: makeUsage(input, output),
    response: undefined,
  }) as Response.FinishPartEncoded;

const streamPart = (part: unknown): Response.StreamPartEncoded =>
  part as Response.StreamPartEncoded;

// ---------------------------------------------------------------------------
// Response builders (produce PartEncoded[])
// ---------------------------------------------------------------------------

export const textParts = (
  content: string,
  inputTokens = 10,
  outputTokens = 5,
): Response.PartEncoded[] => [
  { type: "text", text: content } as Response.TextPartEncoded,
  finishPart("stop", inputTokens, outputTokens),
];

export const toolCallParts = (
  calls: Array<{ id: string; name: string; arguments: string }>,
  inputTokens = 10,
  outputTokens = 5,
): Response.PartEncoded[] => [
  ...calls.map((tc) => {
    let params: unknown;
    try {
      params = JSON.parse(tc.arguments);
    } catch {
      params = {};
    }
    return { type: "tool-call", id: tc.id, name: tc.name, params } as Response.ToolCallPartEncoded;
  }),
  finishPart("tool-calls", inputTokens, outputTokens),
];

// ---------------------------------------------------------------------------
// Convert PartEncoded[] to StreamPartEncoded[] for streamText mock
// ---------------------------------------------------------------------------

const partEncodedToStreamParts = (parts: Response.PartEncoded[]): Response.StreamPartEncoded[] => {
  const stream: Response.StreamPartEncoded[] = [];
  let textIdx = 0;
  let reasonIdx = 0;

  parts.forEach((part) => {
    if (part.type === "text") {
      const id = `text_${textIdx++}`;
      const textPart = part as Response.TextPartEncoded;
      stream.push(streamPart({ type: "text-start", id }));
      stream.push(streamPart({ type: "text-delta", id, delta: textPart.text }));
      stream.push(streamPart({ type: "text-end", id }));
    } else if (part.type === "reasoning") {
      const id = `reasoning_${reasonIdx++}`;
      const reasoningPart = part as Response.PartEncoded & { readonly text?: string };
      stream.push(streamPart({ type: "reasoning-start", id }));
      stream.push(streamPart({ type: "reasoning-delta", id, delta: reasoningPart.text ?? "" }));
      stream.push(streamPart({ type: "reasoning-end", id }));
    } else if (part.type === "tool-call") {
      // tool-call is valid as StreamPartEncoded
      stream.push(streamPart(part));
    } else if (part.type === "finish") {
      stream.push(streamPart(part));
    }
  });

  return stream;
};

// ---------------------------------------------------------------------------
// Mock types
// ---------------------------------------------------------------------------

export type MockResponse = Response.PartEncoded[] | AiError.AiError;

export interface MockLanguageModelOptions {
  readonly onGenerateText?: (options: LanguageModel.ProviderOptions) => void;
}

// ---------------------------------------------------------------------------
// Mock LanguageModel Layer
// ---------------------------------------------------------------------------

export const makeMockLanguageModel = (
  responses: MockResponse[],
  options?: MockLanguageModelOptions,
): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(LanguageModel.LanguageModel)(
    Effect.gen(function* () {
      const ref = yield* Ref.make(0);

      const getNext = Effect.gen(function* () {
        const i = yield* Ref.getAndUpdate(ref, (n) => n + 1);
        const r = responses[i];
        if (!r)
          return yield* AiError.make({
            module: "MockLLM",
            method: "call",
            reason: new AiError.UnknownError({ description: "unexpected call" }),
          });
        if (r instanceof AiError.AiError) return yield* r;
        return r;
      });

      return yield* LanguageModel.make({
        generateText: (providerOptions) =>
          Effect.sync(() => options?.onGenerateText?.(providerOptions)).pipe(
            Effect.flatMap(() => getNext),
          ),

        streamText: () =>
          Stream.unwrap(
            getNext.pipe(
              Effect.map((parts) => Stream.fromIterable(partEncodedToStreamParts(parts))),
            ),
          ),
      });
    }),
  );
