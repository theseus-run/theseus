/**
 * OpenAILanguageModel — LanguageModel provider backed by OpenAI Responses API.
 */

import { BunHttpClient } from "@effect/platform-bun";
import { Clock, Effect, Layer, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { OpenAIConfig, OpenAIConfigLive } from "./openai/config.ts";
import { mapOpenAIError, OpenAIHttpError, OpenAIParseError } from "./openai/errors.ts";
import { buildResponsesRequest, executeResponsesRequest } from "./openai/request.ts";
import { parseResponsesResponseToResponseParts } from "./openai/response-parser.ts";
import {
  parseSSELines,
  processSSEChunkToStreamPart,
  StreamAccumulator,
} from "./openai/streaming.ts";
import type { ResponsesWire } from "./openai/wire.ts";

export const makeOpenAILanguageModel = (
  config: (typeof OpenAIConfig)["Service"],
  http: (typeof HttpClient.HttpClient)["Service"],
  clock: (typeof Clock.Clock)["Service"],
): Effect.Effect<(typeof LanguageModel.LanguageModel)["Service"]> =>
  LanguageModel.make({
    generateText: (options: LanguageModel.ProviderOptions) =>
      Effect.gen(function* () {
        const req = yield* buildResponsesRequest(config, options.prompt, options.tools, false);
        const res = yield* executeResponsesRequest(http, req);
        const data = yield* res.json.pipe(
          Effect.mapError((cause) => new OpenAIParseError({ cause })),
        ) as Effect.Effect<ResponsesWire, OpenAIParseError>;
        return yield* parseResponsesResponseToResponseParts(data);
      }).pipe(Effect.mapError(mapOpenAIError)),

    streamText: (options: LanguageModel.ProviderOptions) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const req = yield* buildResponsesRequest(config, options.prompt, options.tools, true);
          const res = yield* executeResponsesRequest(http, req);
          const acc = new StreamAccumulator(() => clock.currentTimeMillisUnsafe());
          const sseLines = parseSSELines(
            Stream.mapError(
              res.stream,
              () => new OpenAIHttpError({ status: 0, body: "Stream read error" }),
            ),
          );

          return sseLines.pipe(
            Stream.mapError(mapOpenAIError),
            Stream.mapEffect((data) =>
              processSSEChunkToStreamPart(data, acc).pipe(Effect.mapError(mapOpenAIError)),
            ),
            Stream.filter((part) => part !== null),
            Stream.concat(
              Stream.suspend(() =>
                Stream.fromIterableEffect(
                  acc.buildFinalParts().pipe(Effect.mapError(mapOpenAIError)),
                ),
              ),
            ),
          );
        }).pipe(Effect.mapError(mapOpenAIError)),
      ),
  });

export const OpenAILanguageModelLayer = Layer.effect(LanguageModel.LanguageModel)(
  Effect.gen(function* () {
    const config = yield* OpenAIConfig;
    const http = yield* HttpClient.HttpClient;
    const clock = yield* Clock.Clock;
    return yield* makeOpenAILanguageModel(config, http, clock);
  }),
);

export const OpenAILanguageModelLive = OpenAILanguageModelLayer.pipe(
  Layer.provide(BunHttpClient.layer),
  Layer.provide(OpenAIConfigLive),
);
