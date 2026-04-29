import { describe, expect, test } from "bun:test";
import { ConfigProvider, Effect, Layer, References } from "effect";
import { ServerObservabilityLive } from "./observability.ts";

const envLayer = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env }));

describe("ServerObservabilityLive", () => {
  test("loads log level from Effect Config", async () => {
    const level = await Effect.runPromise(
      Effect.service(References.MinimumLogLevel).pipe(
        Effect.provide(
          Layer.provide(ServerObservabilityLive, envLayer({ THESEUS_LOG_LEVEL: "Debug" })),
        ),
      ),
    );

    expect(level).toBe("Debug");
  });
});
