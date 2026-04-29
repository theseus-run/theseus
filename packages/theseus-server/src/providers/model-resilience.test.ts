import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Fiber, Layer, Ref } from "effect";
import { TestClock } from "effect/testing";
import * as AiError from "effect/unstable/ai/AiError";
import { ModelResilience, ModelResilienceLive } from "./model-resilience.ts";

const envLayer = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env }));

const transientError = AiError.make({
  module: "test",
  method: "generateText",
  reason: new AiError.InternalProviderError({ description: "temporary provider failure" }),
});

const permanentError = AiError.make({
  module: "test",
  method: "generateText",
  reason: new AiError.AuthenticationError({ kind: "MissingKey" }),
});

describe("ModelResilience", () => {
  test("retries retryable model failures from Effect Config", async () => {
    const attempts = await Effect.runPromise(
      Effect.gen(function* () {
        const resilience = yield* ModelResilience;
        const attemptsRef = yield* Ref.make(0);

        yield* resilience.withGeneratePolicy(
          Effect.gen(function* () {
            const attempts = yield* Ref.updateAndGet(attemptsRef, (value) => value + 1);
            if (attempts < 3) return yield* transientError;
            return "ok";
          }),
        );

        return yield* Ref.get(attemptsRef);
      }).pipe(
        Effect.provide(
          Layer.provide(
            ModelResilienceLive,
            envLayer({
              THESEUS_MODEL_RETRIES: "2",
              THESEUS_MODEL_RETRY_BASE_MS: "1",
              THESEUS_MODEL_TIMEOUT_MS: "1000",
            }),
          ),
        ),
      ),
    );

    expect(attempts).toBe(3);
  });

  test("does not retry permanent model failures", async () => {
    const attempts = await Effect.runPromise(
      Effect.gen(function* () {
        const resilience = yield* ModelResilience;
        const attemptsRef = yield* Ref.make(0);

        yield* resilience
          .withGeneratePolicy(
            Effect.gen(function* () {
              yield* Ref.update(attemptsRef, (value) => value + 1);
              return yield* permanentError;
            }),
          )
          .pipe(Effect.catchTag("AiError", () => Effect.void));

        return yield* Ref.get(attemptsRef);
      }).pipe(
        Effect.provide(
          Layer.provide(
            ModelResilienceLive,
            envLayer({
              THESEUS_MODEL_RETRIES: "2",
              THESEUS_MODEL_RETRY_BASE_MS: "1",
              THESEUS_MODEL_TIMEOUT_MS: "1000",
            }),
          ),
        ),
      ),
    );

    expect(attempts).toBe(1);
  });

  test("turns model hangs into typed timeout failures", async () => {
    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const resilience = yield* ModelResilience;
        const observed = resilience
          .withGeneratePolicy(Effect.never as Effect.Effect<string, AiError.AiError>)
          .pipe(
            Effect.flatMap(() => Effect.die("expected timeout")),
            Effect.catchTag("AiError", (error) => Effect.succeed(error)),
          );
        const fiber = yield* observed.pipe(Effect.forkChild);

        yield* Effect.yieldNow;
        yield* TestClock.adjust("10 millis");
        return yield* Fiber.join(fiber);
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.merge(
            Layer.provide(
              ModelResilienceLive,
              envLayer({
                THESEUS_MODEL_RETRIES: "0",
                THESEUS_MODEL_TIMEOUT_MS: "10",
              }),
            ),
            TestClock.layer(),
          ),
        ),
      ),
    );

    expect(failure).toBeInstanceOf(AiError.AiError);
    expect(failure.reason._tag).toBe("InternalProviderError");
  });
});
