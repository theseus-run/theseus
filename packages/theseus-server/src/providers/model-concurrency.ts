import { Config, ConfigProvider, Context, Effect, Layer, Semaphore, Stream } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";

export const ModelConcurrencyDefaults = {
  permits: 4,
} as const;

export class ModelConcurrency extends Context.Service<
  ModelConcurrency,
  {
    readonly withPermit: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
    readonly withStreamPermit: <A, E, R>(stream: Stream.Stream<A, E, R>) => Stream.Stream<A, E, R>;
  }
>()("ModelConcurrency") {}

export const ModelConcurrencyLive = Layer.effect(ModelConcurrency)(
  Effect.gen(function* () {
    const provider = yield* ConfigProvider.ConfigProvider;
    const permits = yield* Config.number("THESEUS_MODEL_CONCURRENCY")
      .pipe(Config.withDefault(ModelConcurrencyDefaults.permits))
      .parse(provider);
    const semaphore = yield* Semaphore.make(permits);
    return ModelConcurrency.of({
      withPermit: (effect) => semaphore.withPermit(effect),
      withStreamPermit: (stream) =>
        Stream.unwrap(
          semaphore
            .take(1)
            .pipe(
              Effect.as(stream.pipe(Stream.ensuring(semaphore.release(1).pipe(Effect.asVoid)))),
            ),
        ),
    });
  }),
);

export const limitLanguageModel = (
  model: (typeof LanguageModel.LanguageModel)["Service"],
  concurrency: (typeof ModelConcurrency)["Service"],
): (typeof LanguageModel.LanguageModel)["Service"] => {
  // Effect AI exposes overloaded service methods. The wrapper preserves the
  // service contract while adding one semaphore permit around each provider call.
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
      concurrency.withPermit(raw.generateText(options))) as (typeof model)["generateText"],
    streamText: ((options: LanguageModel.ProviderOptions) =>
      concurrency.withStreamPermit(raw.streamText(options))) as (typeof model)["streamText"],
  };
};
