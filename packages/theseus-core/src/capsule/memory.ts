/**
 * CapsuleLive — Ref-backed in-memory Capsule.
 *
 * Events stored in Ref<CapsuleEvent[]>. Artifacts in Ref<Map<string, string>>.
 * No disk I/O. Replaceable via Effect DI with JSONL, SQLite, etc.
 *
 * Capsule is always-on — it exists from runtime start, not gated by Mission.
 */

import { Effect, Layer, Ref } from "effect";
import { Capsule, CapsuleError, makeCapsuleId, type CapsuleEvent, type CapsuleEventInput } from "./index.ts";

/**
 * Create an in-memory Capsule Layer.
 *
 * Usage:
 *   const capsuleLayer = CapsuleLive("my-session");
 *   Effect.provide(program, capsuleLayer);
 */
export const CapsuleLive = (slug: string): Layer.Layer<Capsule> =>
  Layer.effect(Capsule)(
    Effect.gen(function* () {
      const id = yield* makeCapsuleId(slug);
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
