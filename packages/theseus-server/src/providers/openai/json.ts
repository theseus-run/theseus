import { Effect, Schema } from "effect";
import type { SchemaError } from "effect/Schema";

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
