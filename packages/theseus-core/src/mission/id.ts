/**
 * MissionId — branded identifier for missions.
 *
 * Format: "NANOID7-YYYY-MM-DD-slug" (e.g. "8LZ6XS7-2026-04-07-fix-auth-bug").
 * The nanoid is the identity. Date and slug are hints — can be omitted in lookups.
 */

import { Effect } from "effect";

export type MissionId = string & { readonly _brand: unique symbol };

/** Generate a 7-char uppercase nanoid. */
const nanoid7 = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

/** Generate a unique MissionId. Uses Effect.sync for testability. */
export const makeMissionId = (slug?: string): Effect.Effect<MissionId> =>
  Effect.sync(() => {
    const id = nanoid7();
    const date = new Date().toISOString().slice(0, 10);
    return (slug ? `${id}-${date}-${slug}` : `${id}-${date}`) as MissionId;
  });

/** @deprecated Use makeMissionId (effectful) */
export const MissionId = (slug?: string): MissionId => {
  const id = nanoid7();
  const date = new Date().toISOString().slice(0, 10);
  return slug
    ? `${id}-${date}-${slug}` as MissionId
    : `${id}-${date}` as MissionId;
};
