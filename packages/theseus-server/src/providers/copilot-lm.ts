/**
 * CopilotLanguageModel — LanguageModel provider backed by GitHub Copilot.
 *
 * This file is intentionally only the Effect/AI service assembly. Provider
 * auth, prompt encoding, tool conversion, response parsing, and streaming
 * accumulation live in focused modules under `providers/copilot/`.
 */

import { BunHttpClient } from "@effect/platform-bun";
import { Clock, Effect, Layer, Ref, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type * as AiTool from "effect/unstable/ai/Tool";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { RuntimeConfig, RuntimeConfigLive } from "../config.ts";
import { exchangeToken, readOauthToken } from "./copilot/auth.ts";
import {
  type CopilotAuthError,
  type CopilotEncodeError,
  CopilotHttpError,
  CopilotParseError,
  mapCopilotError,
} from "./copilot/errors.ts";
import {
  aiToolsToChatCompletionsTools,
  aiToolsToResponsesTools,
  promptToChatCompletions,
  promptToResponsesInput,
} from "./copilot/prompt.ts";
import {
  parseChatCompletionsToResponseParts,
  parseResponsesResponseToResponseParts,
} from "./copilot/response-parser.ts";
import {
  parseSSELines,
  processSSEChunkToStreamPart,
  StreamAccumulator,
} from "./copilot/streaming.ts";
import type { ChatCompletionsWire, ResponsesWire, TokenCache } from "./copilot/wire.ts";
import { shouldUseResponsesApi } from "./copilot/wire.ts";

const buildRequest = (
  getBearer: () => Effect.Effect<string, CopilotAuthError | CopilotParseError>,
  config: (typeof RuntimeConfig)["Service"],
  prompt: Prompt.Prompt,
  tools: ReadonlyArray<AiTool.Any>,
  streaming: boolean,
): Effect.Effect<
  { readonly req: HttpClientRequest.HttpClientRequest; readonly useResponses: boolean },
  CopilotAuthError | CopilotParseError | CopilotEncodeError
> =>
  Effect.gen(function* () {
    const model = config.model;
    const bearer = yield* getBearer();
    const useResponses = shouldUseResponsesApi(model);

    const headers = {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      "Editor-Version": "theseus-server/0.0.1",
      "Editor-Plugin-Version": "theseus-server/0.0.1",
      "Copilot-Integration-Id": "vscode-chat",
      Accept: "application/json",
    };

    const body: Record<string, unknown> = useResponses
      ? {
          model,
          input: yield* promptToResponsesInput(prompt),
          max_output_tokens: config.maxTokens,
          stream: streaming,
          ...(tools.length > 0 ? { tools: aiToolsToResponsesTools(tools) } : {}),
        }
      : {
          model,
          messages: yield* promptToChatCompletions(prompt),
          max_tokens: config.maxTokens,
          stream: streaming,
          ...(tools.length > 0 ? { tools: aiToolsToChatCompletionsTools(tools) } : {}),
        };

    const endpoint = useResponses
      ? `${config.copilotApiUrl}/responses`
      : `${config.copilotApiUrl}/chat/completions`;

    const req = HttpClientRequest.post(endpoint).pipe(
      HttpClientRequest.setHeaders(headers),
      HttpClientRequest.bodyJsonUnsafe(body),
    );

    return { req, useResponses };
  });

const executeRequest = (
  http: (typeof HttpClient.HttpClient)["Service"],
  req: HttpClientRequest.HttpClientRequest,
) =>
  Effect.gen(function* () {
    const res = yield* http
      .execute(req)
      .pipe(Effect.mapError((cause) => new CopilotHttpError({ status: 0, body: String(cause) })));
    if (res.status !== 200) {
      const text = yield* res.text.pipe(
        Effect.mapError((cause) => new CopilotParseError({ cause })),
      );
      return yield* new CopilotHttpError({ status: res.status, body: text });
    }
    return res;
  });

/** Core layer — requires HttpClient from environment. */
export const CopilotLanguageModelLayer = Layer.effect(LanguageModel.LanguageModel)(
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const config = yield* RuntimeConfig;
    const clock = yield* Clock.Clock;
    const tokenCacheRef = yield* Ref.make<TokenCache | null>(null);

    const getBearer = (): Effect.Effect<string, CopilotAuthError | CopilotParseError> =>
      Effect.gen(function* () {
        const nowMillis = yield* Clock.currentTimeMillis;
        const now = Math.floor(nowMillis / 1000);
        const cached = yield* Ref.get(tokenCacheRef);
        if (cached !== null && cached.expiresAt - now > 60) return cached.bearer;
        const oauth = yield* readOauthToken;
        const fresh = yield* exchangeToken(http, config, oauth);
        yield* Ref.set(tokenCacheRef, fresh);
        return fresh.bearer;
      });

    return yield* LanguageModel.make({
      generateText: (options: LanguageModel.ProviderOptions) =>
        Effect.gen(function* () {
          const { req, useResponses } = yield* buildRequest(
            getBearer,
            config,
            options.prompt,
            options.tools,
            false,
          );
          const res = yield* executeRequest(http, req);
          const data = yield* res.json.pipe(
            Effect.mapError((cause) => new CopilotParseError({ cause })),
          ) as Effect.Effect<ChatCompletionsWire | ResponsesWire, CopilotParseError>;

          return yield* useResponses
            ? parseResponsesResponseToResponseParts(data as ResponsesWire)
            : parseChatCompletionsToResponseParts(data as ChatCompletionsWire);
        }).pipe(Effect.mapError(mapCopilotError)),

      streamText: (options: LanguageModel.ProviderOptions) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { req, useResponses } = yield* buildRequest(
              getBearer,
              config,
              options.prompt,
              options.tools,
              true,
            );
            const res = yield* executeRequest(http, req);
            const acc = new StreamAccumulator(() => clock.currentTimeMillisUnsafe());

            const sseLines = parseSSELines(
              Stream.mapError(
                res.stream,
                () => new CopilotHttpError({ status: 0, body: "Stream read error" }),
              ),
            );

            return sseLines.pipe(
              Stream.mapError(mapCopilotError),
              Stream.mapEffect((data) =>
                processSSEChunkToStreamPart(data, acc, useResponses).pipe(
                  Effect.mapError(mapCopilotError),
                ),
              ),
              Stream.filter((part) => part !== null),
              Stream.concat(
                Stream.suspend(() =>
                  Stream.fromIterableEffect(
                    acc.buildFinalParts().pipe(Effect.mapError(mapCopilotError)),
                  ),
                ),
              ),
            );
          }).pipe(Effect.mapError(mapCopilotError)),
        ),
    });
  }),
);

/** Convenience live layer with BunHttpClient + RuntimeConfigLive. */
export const CopilotLanguageModelLive = CopilotLanguageModelLayer.pipe(
  Layer.provide(BunHttpClient.layer),
  Layer.provide(RuntimeConfigLive),
);
