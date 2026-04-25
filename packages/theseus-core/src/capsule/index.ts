/**
 * Capsule — the mission's append-only log.
 *
 * Exists for the human reviewing the voyage — debugging, extracting
 * improvement patterns, feeding the next mission. Not for the AI.
 *
 * Event types are open strings, data is unknown — extensible without
 * versioning. Readers parse what they understand and ignore the rest.
 *
 * Ship metaphor: the black box. Append-only. Survives the crash.
 */

import { Clock, Context, Data, Effect, Random } from "effect";

// ---------------------------------------------------------------------------
// CapsuleId — branded string
// ---------------------------------------------------------------------------

export type CapsuleId = string & { readonly _brand: unique symbol };

export const makeCapsuleId = (slug: string): Effect.Effect<CapsuleId> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const rand = yield* Random.nextIntBetween(0, 36 ** 7 - 1);
    const iso = new Date(now).toISOString();
    const date = iso.slice(0, 10).replace(/-/g, "");
    const time = iso.slice(11, 16).replace(":", "");
    const suffix = rand.toString(36).padStart(7, "0");
    return `${date}-${time}-${suffix}-${slug}` as CapsuleId;
  });

// ---------------------------------------------------------------------------
// CapsuleEvent — append-only log entry
// ---------------------------------------------------------------------------

/**
 * A single event in the capsule log.
 *
 * `type` is an open string — "mission.create", "mission.plan",
 * "mission.friction", "tool.call", "agent.dispatch", etc.
 * `data` is unknown — readers parse what they understand.
 */
export interface CapsuleEvent {
  readonly type: string;
  readonly at: string; // ISO timestamp — auto-set by log()
  readonly by: string; // "runtime" | agent slug
  readonly data: unknown;
}

/** Input to log() — `at` is auto-set. */
export type CapsuleEventInput = Omit<CapsuleEvent, "at">;

// ---------------------------------------------------------------------------
// Capsule — the Effect service
// ---------------------------------------------------------------------------

export class Capsule extends Context.Service<
  Capsule,
  {
    /** Capsule identifier. */
    readonly id: CapsuleId;
    /** Append an event. Timestamp is auto-set. Always succeeds. */
    readonly log: (event: CapsuleEventInput) => Effect.Effect<void>;
    /** Read all events in order. */
    readonly read: () => Effect.Effect<ReadonlyArray<CapsuleEvent>>;
    /** Write a named artifact (plan.md, mission.md, etc.). Overwrites if exists. */
    readonly artifact: (name: string, content: string) => Effect.Effect<void>;
    /** Read a named artifact back. Fails if not found. */
    readonly readArtifact: (name: string) => Effect.Effect<string, CapsuleError>;
  }
>()("Capsule") {}

// ---------------------------------------------------------------------------
// CapsuleError
// ---------------------------------------------------------------------------

export class CapsuleError extends Data.TaggedError("CapsuleError")<{
  readonly capsule: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
