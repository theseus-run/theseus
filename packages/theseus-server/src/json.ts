import { Effect, Schema } from "effect";
import type { SchemaError } from "effect/Schema";

export const encodeJson = (value: unknown): string =>
  Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(value);

export const decodeJson = (text: string): unknown =>
  Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(text);

export const encodeJsonEffect = <E>(
  value: unknown,
  mapError: (cause: SchemaError) => E,
): Effect.Effect<string, E> =>
  Schema.encodeUnknownEffect(Schema.UnknownFromJsonString)(value).pipe(Effect.mapError(mapError));

export const decodeJsonEffect = <E>(
  text: string,
  mapError: (cause: SchemaError) => E,
): Effect.Effect<unknown, E> =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(Effect.mapError(mapError));
