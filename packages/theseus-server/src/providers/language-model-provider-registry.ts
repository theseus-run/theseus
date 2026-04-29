import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Clock, Context, Effect, Layer, Match } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type { LanguageModelProvider } from "../config.ts";
import { CopilotConfig } from "./copilot/config.ts";
import { makeCopilotLanguageModel } from "./copilot-lm.ts";
import { OpenAIConfig } from "./openai/config.ts";
import { makeOpenAILanguageModel } from "./openai-lm.ts";

type LanguageModelService = (typeof LanguageModel.LanguageModel)["Service"];

interface ProviderBinding<Provider extends LanguageModelProvider = LanguageModelProvider> {
  readonly provider: Provider;
  readonly resolve: (
    request: Dispatch.ModelRequest | undefined,
  ) => Effect.Effect<LanguageModelResolution>;
}

export interface LanguageModelResolution {
  readonly provider: LanguageModelProvider;
  readonly model: string;
  readonly languageModel: LanguageModelService;
}

export class LanguageModelProviderRegistry extends Context.Service<
  LanguageModelProviderRegistry,
  {
    readonly resolve: (
      request: Dispatch.ModelRequest | undefined,
      fallback: LanguageModelProvider,
    ) => Effect.Effect<LanguageModelResolution>;
  }
>()("LanguageModelProviderRegistry") {}

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

export const LanguageModelProviderRegistryLive = Layer.effect(LanguageModelProviderRegistry)(
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const clock = yield* Clock.Clock;
    const copilotConfig = yield* CopilotConfig;
    const openAIConfig = yield* OpenAIConfig;

    const bindings = {
      copilot: {
        provider: "copilot",
        resolve: (request) => {
          const providerRequest = Match.value(request).pipe(
            Match.when({ provider: "copilot" }, (matched) => matched),
            Match.orElse(() => undefined),
          );
          return makeCopilotLanguageModel(
            copilotConfigForRequest(copilotConfig, providerRequest),
            http,
            clock,
          ).pipe(
            Effect.map((languageModel) => ({
              provider: "copilot" as const,
              model: providerRequest?.model ?? copilotConfig.model,
              languageModel,
            })),
          );
        },
      },
      openai: {
        provider: "openai",
        resolve: (request) => {
          const providerRequest = Match.value(request).pipe(
            Match.when({ provider: "openai" }, (matched) => matched),
            Match.orElse(() => undefined),
          );
          return makeOpenAILanguageModel(
            openAIConfigForRequest(openAIConfig, providerRequest),
            http,
            clock,
          ).pipe(
            Effect.map((languageModel) => ({
              provider: "openai" as const,
              model: providerRequest?.model ?? openAIConfig.model,
              languageModel,
            })),
          );
        },
      },
    } satisfies { readonly [Provider in LanguageModelProvider]: ProviderBinding<Provider> };

    return LanguageModelProviderRegistry.of({
      resolve: (request, fallback) => {
        const provider = providerFromRequest(request, fallback);
        return bindings[provider].resolve(request);
      },
    });
  }),
);
