import { Config, ConfigProvider, Effect, Layer, Logger, Match, References } from "effect";
import type * as LogLevel from "effect/LogLevel";

export const ServerObservabilityDefaults = {
  logLevel: "Info" satisfies LogLevel.LogLevel,
} as const;

const parseLogLevel = (value: string): Effect.Effect<LogLevel.LogLevel> =>
  Match.value(value).pipe(
    Match.when("All", () => Effect.succeed("All" as const)),
    Match.when("Trace", () => Effect.succeed("Trace" as const)),
    Match.when("Debug", () => Effect.succeed("Debug" as const)),
    Match.when("Info", () => Effect.succeed("Info" as const)),
    Match.when("Warn", () => Effect.succeed("Warn" as const)),
    Match.when("Error", () => Effect.succeed("Error" as const)),
    Match.when("Fatal", () => Effect.succeed("Fatal" as const)),
    Match.when("None", () => Effect.succeed("None" as const)),
    Match.orElse(() => Effect.succeed(ServerObservabilityDefaults.logLevel)),
  );

export const ServerObservabilityLive = Layer.unwrap(
  Effect.gen(function* () {
    const provider = yield* ConfigProvider.ConfigProvider;
    const logLevelText = yield* Config.string("THESEUS_LOG_LEVEL")
      .pipe(Config.withDefault(ServerObservabilityDefaults.logLevel))
      .parse(provider);
    const logLevel = yield* parseLogLevel(logLevelText);
    return Layer.mergeAll(
      Logger.layer([Logger.consoleLogFmt]),
      Layer.succeed(References.MinimumLogLevel)(logLevel),
    );
  }),
);
