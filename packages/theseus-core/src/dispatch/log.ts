/**
 * DispatchLog — append-only event log for audit, replay, and restore.
 *
 * Records all DispatchEvents with metadata plus message snapshots
 * for session restoration. In-memory (Ref) by default — swap to
 * SQLite/JSONL via Layer.
 *
 * Separate from Capsule: Capsule is the curated public record.
 * DispatchLog is the raw internal audit trail.
 */

import { Effect, Layer, Ref } from "effect";
import * as ServiceMap from "effect/ServiceMap";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { DispatchEvent, DispatchOptions, Usage } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventEntry {
  readonly timestamp: number;
  readonly dispatchId: string;
  readonly event: DispatchEvent;
}

export interface Snapshot {
  readonly timestamp: number;
  readonly dispatchId: string;
  readonly iteration: number;
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
  readonly usage: Usage;
}

// ---------------------------------------------------------------------------
// DispatchLog — service definition
// ---------------------------------------------------------------------------

export class DispatchLog extends ServiceMap.Service<
  DispatchLog,
  {
    /** Record a dispatch event. */
    readonly record: (dispatchId: string, event: DispatchEvent) => Effect.Effect<void>;
    /** Save message state for restore. */
    readonly snapshot: (
      dispatchId: string,
      iteration: number,
      messages: ReadonlyArray<Prompt.MessageEncoded>,
      usage: Usage,
    ) => Effect.Effect<void>;
    /** Replay events for a dispatch (or all if no id). */
    readonly events: (dispatchId?: string) => Effect.Effect<ReadonlyArray<EventEntry>>;
    /** Get restore options for a dispatch (latest snapshot). */
    readonly restore: (dispatchId: string) => Effect.Effect<DispatchOptions | undefined>;
  }
>()("DispatchLog") {}

// ---------------------------------------------------------------------------
// InMemoryDispatchLog
// ---------------------------------------------------------------------------

export const InMemoryDispatchLog: Layer.Layer<DispatchLog> = Layer.effect(DispatchLog)(
  Effect.gen(function* () {
    const eventsRef = yield* Ref.make<EventEntry[]>([]);
    const snapshotsRef = yield* Ref.make<Snapshot[]>([]);

    return {
      record: (dispatchId, event) =>
        Ref.update(eventsRef, (entries) => [
          ...entries,
          { timestamp: Date.now(), dispatchId, event },
        ]),

      snapshot: (dispatchId, iteration, messages, usage) =>
        Ref.update(snapshotsRef, (snaps) => [
          ...snaps,
          { timestamp: Date.now(), dispatchId, iteration, messages, usage },
        ]),

      events: (dispatchId) =>
        Ref.get(eventsRef).pipe(
          Effect.map((entries) =>
            dispatchId ? entries.filter((e) => e.dispatchId === dispatchId) : entries,
          ),
        ),

      restore: (dispatchId) =>
        Ref.get(snapshotsRef).pipe(
          Effect.map((snaps) => {
            const matching = snaps.filter((s) => s.dispatchId === dispatchId);
            if (matching.length === 0) return undefined;
            const latest = matching[matching.length - 1]!;
            return {
              messages: latest.messages,
              iteration: latest.iteration,
              usage: latest.usage,
            };
          }),
        ),
    };
  }),
);

// ---------------------------------------------------------------------------
// NoopDispatchLog — no-op for when logging is not needed
// ---------------------------------------------------------------------------

export const NoopDispatchLog: Layer.Layer<DispatchLog> = Layer.succeed(DispatchLog, {
  record: () => Effect.void,
  snapshot: () => Effect.void,
  events: () => Effect.succeed([]),
  restore: () => Effect.succeed(undefined),
});
