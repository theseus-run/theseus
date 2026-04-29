import { describe, expect, test } from "bun:test";
import { ConfigProvider, Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { ModelConcurrency, ModelConcurrencyLive } from "./model-concurrency.ts";

const envLayer = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env }));

describe("ModelConcurrency", () => {
  test("limits concurrent model work from Effect Config", async () => {
    const maxActive = await Effect.runPromise(
      Effect.gen(function* () {
        const concurrency = yield* ModelConcurrency;
        const active = yield* Ref.make(0);
        const max = yield* Ref.make(0);
        const firstStarted = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();

        const work = concurrency.withPermit(
          Effect.gen(function* () {
            const nextActive = yield* Ref.updateAndGet(active, (value) => value + 1);
            yield* Ref.update(max, (value) => Math.max(value, nextActive));
            yield* Deferred.succeed(firstStarted, undefined);
            yield* Deferred.await(release);
            yield* Ref.update(active, (value) => value - 1);
          }),
        );

        const first = yield* work.pipe(Effect.forkChild);
        yield* Deferred.await(firstStarted);
        const second = yield* work.pipe(Effect.forkChild);

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(first);
        yield* Fiber.join(second);
        return yield* Ref.get(max);
      }).pipe(
        Effect.provide(
          Layer.provide(ModelConcurrencyLive, envLayer({ THESEUS_MODEL_CONCURRENCY: "1" })),
        ),
      ),
    );

    expect(maxActive).toBe(1);
  });
});
