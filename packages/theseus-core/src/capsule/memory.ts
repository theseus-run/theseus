/**
 * InMemoryCapsuleLive — Ref-backed Capsule for testing and prototyping.
 *
 * Events stored in Ref<CapsuleEvent[]>. Artifacts in Ref<Map<string, string>>.
 * No disk I/O. JSONL persistence is a Layer swap for later.
 */

import { Effect, Layer, Ref } from "effect";
import { Capsule, CapsuleError, CapsuleId, type CapsuleEvent, type CapsuleEventInput } from "./index.ts";

/**
 * Create an in-memory Capsule Layer for a given slug.
 *
 * Usage:
 *   const capsuleLayer = InMemoryCapsuleLive("my-mission");
 *   Effect.provide(program, capsuleLayer);
 */
export const InMemoryCapsuleLive = (slug: string): Layer.Layer<Capsule> =>
  Layer.effect(Capsule)(
    Effect.gen(function* () {
      const id = CapsuleId(slug);
      const eventsRef = yield* Ref.make<ReadonlyArray<CapsuleEvent>>([]);
      const artifactsRef = yield* Ref.make<ReadonlyMap<string, string>>(new Map());

      return Capsule.of({
        id,

        log: (input: CapsuleEventInput) =>
          Ref.update(eventsRef, (events) => [
            ...events,
            { ...input, at: new Date().toISOString() },
          ]),

        read: () => Ref.get(eventsRef),

        artifact: (name: string, content: string) =>
          Ref.update(artifactsRef, (map) => new Map([...map, [name, content]])),

        readArtifact: (name: string) =>
          Effect.gen(function* () {
            const map = yield* Ref.get(artifactsRef);
            const content = map.get(name);
            if (content === undefined) {
              return yield* Effect.fail(
                new CapsuleError({ capsule: id, message: `Artifact not found: ${name}` }),
              );
            }
            return content;
          }),
      });
    }),
  );
