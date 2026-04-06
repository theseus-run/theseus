/**
 * Mock LanguageModel for tests.
 *
 * Accepts an array of MockResponse values (each a Response.PartEncoded[]).
 * Returns them in sequence on each generateText call.
 */

import { Effect, Layer, Ref, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as AiError from "effect/unstable/ai/AiError";
import type * as Response from "effect/unstable/ai/Response";

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

const makeUsage = (input: number, output: number) => ({
  inputTokens: { total: input, uncached: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: undefined, reasoning: undefined },
});

export const textParts = (
  content: string,
  inputTokens = 10,
  outputTokens = 5,
): Response.PartEncoded[] => [
  { type: "text", text: content },
  { type: "finish", reason: "stop", usage: makeUsage(inputTokens, outputTokens), response: undefined } as any,
];

export const toolCallParts = (
  calls: Array<{ id: string; name: string; arguments: string }>,
  inputTokens = 10,
  outputTokens = 5,
): Response.PartEncoded[] => [
  ...calls.map((tc) => {
    let params: unknown;
    try { params = JSON.parse(tc.arguments); } catch { params = {}; }
    return { type: "tool-call", id: tc.id, name: tc.name, params } as Response.PartEncoded;
  }),
  { type: "finish", reason: "tool-calls", usage: makeUsage(inputTokens, outputTokens), response: undefined } as any,
];

// ---------------------------------------------------------------------------
// Mock types
// ---------------------------------------------------------------------------

export type MockResponse = Response.PartEncoded[] | AiError.AiError;

// ---------------------------------------------------------------------------
// Mock LanguageModel Layer
// ---------------------------------------------------------------------------

export const makeMockLanguageModel = (responses: MockResponse[]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(LanguageModel.LanguageModel)(
    Effect.gen(function* () {
      const ref = yield* Ref.make(0);

      return yield* LanguageModel.make({
        generateText: () =>
          Effect.gen(function* () {
            const i = yield* Ref.getAndUpdate(ref, (n) => n + 1);
            const r = responses[i];
            if (!r) return yield* Effect.fail(
              AiError.make({ module: "MockLLM", method: "generateText", reason: new AiError.UnknownError({ description: "unexpected call" }) }),
            );
            if (r instanceof AiError.AiError) return yield* Effect.fail(r);
            return r;
          }),

        streamText: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              const i = yield* Ref.getAndUpdate(ref, (n) => n + 1);
              const r = responses[i];
              if (!r) return Stream.fail(
                AiError.make({ module: "MockLLM", method: "streamText", reason: new AiError.UnknownError({ description: "unexpected call" }) }),
              );
              if (r instanceof AiError.AiError) return Stream.fail(r);
              // Emit each part as a stream element
              return Stream.fromIterable(r as Iterable<Response.StreamPartEncoded>);
            }),
          ),
      });
    }),
  );
