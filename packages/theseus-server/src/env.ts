import { Context, Layer } from "effect";

export interface ServerEnvService {
  readonly get: (key: string) => string | undefined;
}

export class ServerEnv extends Context.Service<ServerEnv, ServerEnvService>()("ServerEnv") {}

export const ServerEnvLive = Layer.succeed(ServerEnv)({
  get: (key) => process.env[key],
});

export const getEnvInt = (env: ServerEnvService, key: string, fallback: number): number => {
  const value = env.get(key);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getEnvOption = <T extends string>(
  env: ServerEnvService,
  key: string,
  allowed: ReadonlyArray<T>,
): T | undefined => {
  const value = env.get(key);
  return allowed.includes(value as T) ? (value as T) : undefined;
};
