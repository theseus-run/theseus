import * as Dispatch from "@theseus.run/core/Dispatch";
import { Clock, Effect, Layer, Match } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { type LanguageModelProvider, ServerConfig } from "../config.ts";
import { CopilotConfig } from "./copilot/config.ts";
import { makeCopilotLanguageModel } from "./copilot-lm.ts";
import { OpenAIConfig } from "./openai/config.ts";
import { makeOpenAILanguageModel } from "./openai-lm.ts";

const providerFromRequest = (
  request: Dispatch.ModelRequest | undefined,
  fallback: LanguageModelProvider,
): LanguageModelProvider => request?.provider ?? fallback;

const copilotConfigForRequest = (
  base: (typeof CopilotConfig)["Service"],
  request: Dispatch.CopilotModelRequest | undefined,
): (typeof CopilotConfig)["Service"] =>
  CopilotConfig.of({
    model: request?.model ?? base.model,
    maxTokens: request?.maxTokens ?? base.maxTokens,
    copilotAuthUrl: base.copilotAuthUrl,
    copilotApiUrl: base.copilotApiUrl,
  });

const openAIConfigForRequest = (
  base: (typeof OpenAIConfig)["Service"],
  request: Dispatch.OpenAIModelRequest | undefined,
): (typeof OpenAIConfig)["Service"] =>
  OpenAIConfig.of({
    apiKey: base.apiKey,
    apiUrl: base.apiUrl,
    model: request?.model ?? base.model,
    maxOutputTokens: request?.maxOutputTokens ?? base.maxOutputTokens,
    reasoningEffort: request?.reasoningEffort ?? base.reasoningEffort,
    textVerbosity: request?.textVerbosity ?? base.textVerbosity,
  });

export const ServerLanguageModelGatewayLive = Layer.effect(Dispatch.LanguageModelGateway)(
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const clock = yield* Clock.Clock;
    const serverConfig = yield* ServerConfig;
    const copilotConfig = yield* CopilotConfig;
    const openAIConfig = yield* OpenAIConfig;

    return Dispatch.LanguageModelGateway.of({
      resolve: (request) =>
        Match.value(providerFromRequest(request, serverConfig.languageModelProvider)).pipe(
          Match.when("copilot", () =>
            makeCopilotLanguageModel(
              copilotConfigForRequest(
                copilotConfig,
                request?.provider === "copilot" ? request : undefined,
              ),
              http,
              clock,
            ),
          ),
          Match.when("openai", () =>
            makeOpenAILanguageModel(
              openAIConfigForRequest(
                openAIConfig,
                request?.provider === "openai" ? request : undefined,
              ),
              http,
              clock,
            ),
          ),
          Match.exhaustive,
        ),
    });
  }),
);
