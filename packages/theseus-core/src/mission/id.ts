/**
 * MissionId — branded identifier for missions.
 *
 * Format: "NANOID7-YYYY-MM-DD-slug" (e.g. "8LZ6XS7-2026-04-07-fix-auth-bug").
 * The nanoid is the identity. Date and slug are hints — can be omitted in lookups.
 */

import { Clock, Effect, Random } from "effect";

export type MissionId = string & { readonly _brand: unique symbol };

/** Generate a 7-char uppercase nanoid. */
const nanoid7: Effect.Effect<string> = Effect.gen(function* () {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const index = yield* Random.nextIntBetween(0, chars.length - 1);
    out.push(chars[index] ?? "A");
  }
  return out.join("");
});

export const makeMissionId = (slug?: string): Effect.Effect<MissionId> =>
  Effect.gen(function* () {
    const id = yield* nanoid7;
    const now = yield* Clock.currentTimeMillis;
    const date = new Date(now).toISOString().slice(0, 10);
    return (slug ? `${id}-${date}-${slug}` : `${id}-${date}`) as MissionId;
  });
