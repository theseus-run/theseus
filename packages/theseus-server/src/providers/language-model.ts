import * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect, Layer } from "effect";
import { ServerConfig } from "../config.ts";
import { LanguageModelProviderRegistry } from "./language-model-provider-registry.ts";
import { limitLanguageModel, ModelConcurrency } from "./model-concurrency.ts";
import { applyModelResilience, ModelResilience } from "./model-resilience.ts";

type LanguageModelService = Parameters<typeof limitLanguageModel>[0];

export const ServerLanguageModelGatewayLive = Layer.effect(Dispatch.LanguageModelGateway)(
  Effect.gen(function* () {
    const serverConfig = yield* ServerConfig;
    const providers = yield* LanguageModelProviderRegistry;
    const concurrency = yield* ModelConcurrency;
    const resilience = yield* ModelResilience;

    const applyPolicies = (model: LanguageModelService) =>
      limitLanguageModel(applyModelResilience(model, resilience), concurrency);

    return Dispatch.LanguageModelGateway.of({
      resolve: (request) =>
        providers.resolve(request, serverConfig.languageModelProvider).pipe(
          Effect.flatMap(({ provider, model, languageModel }) =>
            Effect.succeed(applyPolicies(languageModel)).pipe(
              Effect.withSpan("language_model.resolve", {
                attributes: { provider, model },
              }),
            ),
          ),
        ),
    });
  }),
);
