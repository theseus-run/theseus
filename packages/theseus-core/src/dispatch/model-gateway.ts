import { Context, Data, Effect, Layer } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";

export type OpenAIReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type OpenAITextVerbosity = "low" | "medium" | "high";

export interface OpenAIModelRequest {
  readonly provider: "openai";
  readonly model: string;
  readonly maxOutputTokens?: number | undefined;
  readonly reasoningEffort?: OpenAIReasoningEffort | undefined;
  readonly textVerbosity?: OpenAITextVerbosity | undefined;
}

export interface CopilotModelRequest {
  readonly provider: "copilot";
  readonly model: string;
  readonly maxTokens?: number | undefined;
}

export type ModelRequest = OpenAIModelRequest | CopilotModelRequest;

export class ModelUnavailable extends Data.TaggedError("ModelUnavailable")<{
  readonly provider: string;
  readonly model: string;
  readonly reason: string;
}> {}

export interface LanguageModelGatewayService {
  readonly resolve: (
    request: ModelRequest | undefined,
  ) => Effect.Effect<(typeof LanguageModel.LanguageModel)["Service"], ModelUnavailable>;
}

export class LanguageModelGateway extends Context.Service<
  LanguageModelGateway,
  LanguageModelGatewayService
>()("LanguageModelGateway") {}

export const LanguageModelGatewayFromLanguageModel = Layer.effect(LanguageModelGateway)(
  Effect.gen(function* () {
    const languageModel = yield* LanguageModel.LanguageModel;

    return LanguageModelGateway.of({
      resolve: (request) =>
        request === undefined
          ? Effect.succeed(languageModel)
          : Effect.fail(
              new ModelUnavailable({
                provider: request.provider,
                model: request.model,
                reason: "Explicit model requests require a provider-backed gateway",
              }),
            ),
    });
  }),
);
