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

// ---------------------------------------------------------------------------
// Response builders (produce PartEncoded[])
// ---------------------------------------------------------------------------

export const textParts = (
  content: string,
  inputTokens = 10,
  outputTokens = 5,
): Response.PartEncoded[] => [
  { type: "text", text: content } as Response.TextPartEncoded,
  {
    type: "finish",
    reason: "stop",
    usage: makeUsage(inputTokens, outputTokens),
    response: undefined,
  } as any,
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
  {
    type: "finish",
    reason: "tool-calls",
    usage: makeUsage(inputTokens, outputTokens),
    response: undefined,
  } as any,
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
      stream.push({ type: "text-start", id } as any);
      stream.push({ type: "text-delta", id, delta: (part as any).text } as any);
      stream.push({ type: "text-end", id } as any);
    } else if (part.type === "reasoning") {
      const id = `reasoning_${reasonIdx++}`;
      stream.push({ type: "reasoning-start", id } as any);
      stream.push({ type: "reasoning-delta", id, delta: (part as any).text } as any);
      stream.push({ type: "reasoning-end", id } as any);
    } else if (part.type === "tool-call") {
      // tool-call is valid as StreamPartEncoded
      stream.push(part as any);
    } else if (part.type === "finish") {
      stream.push(part as any);
    }
  });

  return stream;
};

// ---------------------------------------------------------------------------
// Mock types
// ---------------------------------------------------------------------------

export type MockResponse = Response.PartEncoded[] | AiError.AiError;

// ---------------------------------------------------------------------------
// Mock LanguageModel Layer
// ---------------------------------------------------------------------------

export const makeMockLanguageModel = (
  responses: MockResponse[],
): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(LanguageModel.LanguageModel)(
    Effect.gen(function* () {
      const ref = yield* Ref.make(0);

      const getNext = Effect.gen(function* () {
        const i = yield* Ref.getAndUpdate(ref, (n) => n + 1);
        const r = responses[i];
        if (!r)
          return yield* Effect.fail(
            AiError.make({
              module: "MockLLM",
              method: "call",
              reason: new AiError.UnknownError({ description: "unexpected call" }),
            }),
          );
        if (r instanceof AiError.AiError) return yield* Effect.fail(r);
        return r;
      });

      return yield* LanguageModel.make({
        generateText: () => getNext,

        streamText: () =>
          Stream.unwrap(
            getNext.pipe(
              Effect.map((parts) => Stream.fromIterable(partEncodedToStreamParts(parts))),
            ),
          ),
      });
    }),
  );
