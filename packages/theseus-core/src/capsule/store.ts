/**
 * CapsuleStore — collection boundary for capsule records.
 *
 * Minimal today: create one in-memory capsule record. Current capsule access
 * remains the `CurrentCapsule` service.
 */

import { Clock, Context, Effect, Layer, Ref } from "effect";
import {
  CapsuleError,
  type CapsuleEvent,
  type CapsuleEventInput,
  type CapsuleRecord,
  CurrentCapsule,
  makeCapsuleId,
} from "./index.ts";

export interface CapsuleCreate {
  readonly slug: string;
}

export class CapsuleStore extends Context.Service<
  CapsuleStore,
  {
    readonly create: (input: CapsuleCreate) => Effect.Effect<CapsuleRecord>;
  }
>()("CapsuleStore") {}

export const makeInMemoryCapsuleRecord = (slug: string): Effect.Effect<CapsuleRecord> =>
  Effect.gen(function* () {
    const id = yield* makeCapsuleId(slug);
    const eventsRef = yield* Ref.make<ReadonlyArray<CapsuleEvent>>([]);
    const artifactsRef = yield* Ref.make<ReadonlyMap<string, string>>(new Map());

    return {
      id,

      log: (input: CapsuleEventInput) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          yield* Ref.update(eventsRef, (events) => [
            ...events,
            { ...input, at: new Date(now).toISOString() },
          ]);
        }),

      read: () => Ref.get(eventsRef),

      artifact: (name: string, content: string) =>
        Ref.update(artifactsRef, (map) => new Map([...map, [name, content]])),

      readArtifact: (name: string) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(artifactsRef);
          const content = map.get(name);
          if (content === undefined) {
            return yield* new CapsuleError({
              capsule: id,
              message: `Artifact not found: ${name}`,
            });
          }
          return content;
        }),
    };
  });

export const InMemoryCapsuleStore: Layer.Layer<CapsuleStore> = Layer.succeed(CapsuleStore)({
  create: ({ slug }) => makeInMemoryCapsuleRecord(slug),
});

export const CurrentCapsuleLive = (slug: string): Layer.Layer<CurrentCapsule> =>
  Layer.effect(CurrentCapsule)(makeInMemoryCapsuleRecord(slug));
