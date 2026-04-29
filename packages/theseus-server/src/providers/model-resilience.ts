import { Config, ConfigProvider, Context, Duration, Effect, Layer, Schedule, Stream } from "effect";
import * as AiError from "effect/unstable/ai/AiError";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";

export const ModelResilienceDefaults = {
  timeoutMs: 120_000,
  retryCount: 2,
  retryBaseMs: 250,
  streamIdleTimeoutMs: 120_000,
} as const;

export class ModelResilience extends Context.Service<
  ModelResilience,
  {
    readonly withGeneratePolicy: <A, R>(
      effect: Effect.Effect<A, AiError.AiError, R>,
    ) => Effect.Effect<A, AiError.AiError, R>;
    readonly withStreamPolicy: <A, R>(
      stream: Stream.Stream<A, AiError.AiError, R>,
    ) => Stream.Stream<A, AiError.AiError, R>;
  }
>()("ModelResilience") {}

const timeoutError = (method: string, timeoutMs: number): AiError.AiError =>
  AiError.make({
    module: "TheseusModelResilience",
    method,
    reason: new AiError.InternalProviderError({
      description: `Timed out after ${timeoutMs}ms`,
    }),
  });

const retryPolicy = (count: number, baseMs: number): Schedule.Schedule<unknown, AiError.AiError> =>
  Schedule.exponential(Duration.millis(baseMs)).pipe(
    Schedule.jittered,
    Schedule.take(count),
    Schedule.while(({ input }) => input.isRetryable),
  );

export const ModelResilienceLive = Layer.effect(ModelResilience)(
  Effect.gen(function* () {
    const provider = yield* ConfigProvider.ConfigProvider;
    const timeoutMs = yield* Config.number("THESEUS_MODEL_TIMEOUT_MS")
      .pipe(Config.withDefault(ModelResilienceDefaults.timeoutMs))
      .parse(provider);
    const retryCount = yield* Config.number("THESEUS_MODEL_RETRIES")
      .pipe(Config.withDefault(ModelResilienceDefaults.retryCount))
      .parse(provider);
    const retryBaseMs = yield* Config.number("THESEUS_MODEL_RETRY_BASE_MS")
      .pipe(Config.withDefault(ModelResilienceDefaults.retryBaseMs))
      .parse(provider);
    const streamIdleTimeoutMs = yield* Config.number("THESEUS_MODEL_STREAM_IDLE_TIMEOUT_MS")
      .pipe(Config.withDefault(ModelResilienceDefaults.streamIdleTimeoutMs))
      .parse(provider);

    return ModelResilience.of({
      withGeneratePolicy: (effect) =>
        effect.pipe(
          Effect.timeoutOrElse({
            duration: Duration.millis(timeoutMs),
            orElse: () => Effect.fail(timeoutError("generateText", timeoutMs)),
          }),
          Effect.tapError((error) =>
            error.isRetryable
              ? Effect.logDebug("model generate failed; retry policy will decide").pipe(
                  Effect.annotateLogs({ error: error.message }),
                )
              : Effect.void,
          ),
          Effect.retry(retryPolicy(retryCount, retryBaseMs)),
        ),
      withStreamPolicy: (stream) =>
        stream.pipe(
          Stream.timeoutOrElse({
            duration: Duration.millis(streamIdleTimeoutMs),
            orElse: () => Stream.fail(timeoutError("streamText", streamIdleTimeoutMs)),
          }),
        ),
    });
  }),
);

export const applyModelResilience = (
  model: (typeof LanguageModel.LanguageModel)["Service"],
  resilience: (typeof ModelResilience)["Service"],
): (typeof LanguageModel.LanguageModel)["Service"] => {
  const raw = model as {
    readonly generateText: (
      options: LanguageModel.ProviderOptions,
    ) => ReturnType<(typeof model)["generateText"]>;
    readonly streamText: (
      options: LanguageModel.ProviderOptions,
    ) => ReturnType<(typeof model)["streamText"]>;
  };

  return {
    ...model,
    generateText: ((options: LanguageModel.ProviderOptions) =>
      resilience.withGeneratePolicy(
        raw.generateText(options) as Effect.Effect<unknown, AiError.AiError>,
      )) as (typeof model)["generateText"],
    streamText: ((options: LanguageModel.ProviderOptions) =>
      resilience.withStreamPolicy(
        raw.streamText(options) as Stream.Stream<unknown, AiError.AiError>,
      )) as (typeof model)["streamText"],
  };
};
