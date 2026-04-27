import { Context, Data, Effect, Layer } from "effect";
import { getEnvInt, ServerEnv } from "./env.ts";

export const languageModelProviders = ["copilot", "openai"] as const;

export type LanguageModelProvider = (typeof languageModelProviders)[number];

export class ServerConfigError extends Data.TaggedError("ServerConfigError")<{
  readonly key: string;
  readonly value: string;
  readonly expected: string;
}> {}

export interface ServerConfigService {
  readonly port: number;
  readonly languageModelProvider: LanguageModelProvider;
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigService>()(
  "ServerConfig",
) {}

const isLanguageModelProvider = (value: string): value is LanguageModelProvider =>
  languageModelProviders.includes(value as LanguageModelProvider);

export const parseLanguageModelProvider = (
  value: string | undefined,
): Effect.Effect<LanguageModelProvider, ServerConfigError> => {
  if (value === undefined || value === "") {
    return Effect.succeed("copilot");
  }

  if (isLanguageModelProvider(value)) {
    return Effect.succeed(value);
  }

  return Effect.fail(
    new ServerConfigError({
      key: "THESEUS_PROVIDER",
      value,
      expected: languageModelProviders.join(" | "),
    }),
  );
};

export const ServerConfigLive = Layer.effect(ServerConfig)(
  Effect.gen(function* () {
    const env = yield* ServerEnv;
    const languageModelProvider = yield* parseLanguageModelProvider(env.get("THESEUS_PROVIDER"));

    return ServerConfig.of({
      port: getEnvInt(env, "THESEUS_PORT", 4800),
      languageModelProvider,
    });
  }),
);
