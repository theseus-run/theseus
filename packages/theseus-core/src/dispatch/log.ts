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

import { Clock, Context, Effect, Layer, Ref } from "effect";
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

export interface DispatchSummary {
  readonly dispatchId: string;
  readonly name: string;
  readonly task: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly status: "running" | "done" | "failed";
  readonly usage: Usage;
}

// ---------------------------------------------------------------------------
// DispatchLog — service definition
// ---------------------------------------------------------------------------

export class DispatchLog extends Context.Service<
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
    /** List dispatch summaries (most recent first). */
    readonly list: (options?: { limit?: number }) => Effect.Effect<ReadonlyArray<DispatchSummary>>;
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
        Effect.gen(function* () {
          const timestamp = yield* Clock.currentTimeMillis;
          yield* Ref.update(eventsRef, (entries) => [...entries, { timestamp, dispatchId, event }]);
        }),

      snapshot: (dispatchId, iteration, messages, usage) =>
        Effect.gen(function* () {
          const timestamp = yield* Clock.currentTimeMillis;
          yield* Ref.update(snapshotsRef, (snaps) => [
            ...snaps,
            { timestamp, dispatchId, iteration, messages, usage },
          ]);
        }),

      events: (dispatchId) =>
        Ref.get(eventsRef).pipe(
          Effect.map((entries) =>
            dispatchId ? entries.filter((e) => e.dispatchId === dispatchId) : entries,
          ),
        ),

      restore: (dispatchId) =>
        Effect.gen(function* () {
          const snaps = yield* Ref.get(snapshotsRef);
          const matching = snaps.filter((s) => s.dispatchId === dispatchId);
          if (matching.length === 0) return undefined;
          const latest = matching[matching.length - 1];
          if (latest === undefined) return undefined;

          // Look for parent link in events
          const entries = yield* Ref.get(eventsRef);
          const parentLink = entries.find(
            (e) =>
              e.dispatchId === dispatchId &&
              e.event._tag === "Injected" &&
              e.event.injection === "ParentLink",
          );

          const parentId =
            parentLink?.event._tag === "Injected" ? parentLink.event.detail : undefined;
          const opts: DispatchOptions = {
            dispatchId,
            messages: latest.messages,
            iteration: latest.iteration,
            usage: latest.usage,
          };
          return parentId !== undefined ? { ...opts, parentDispatchId: parentId } : opts;
        }),

      list: (options) =>
        Ref.get(eventsRef).pipe(
          Effect.map((entries) => {
            const byId = new Map<string, EventEntry[]>();
            for (const e of entries) {
              const arr = byId.get(e.dispatchId) ?? [];
              arr.push(e);
              byId.set(e.dispatchId, arr);
            }
            const summaries: DispatchSummary[] = [];
            for (const [dispatchId, evts] of byId) {
              const first = evts[0];
              const last = evts[evts.length - 1];
              if (first === undefined || last === undefined) continue;
              const done = evts.find((e) => e.event._tag === "Done");
              summaries.push({
                dispatchId,
                name: first.event._tag === "Calling" ? first.event.name : "",
                task: "",
                startedAt: first.timestamp,
                completedAt: done ? done.timestamp : null,
                status: done ? "done" : last.event._tag === "Done" ? "done" : "running",
                usage:
                  done?.event._tag === "Done"
                    ? done.event.result.usage
                    : { inputTokens: 0, outputTokens: 0 },
              });
            }
            summaries.sort((a, b) => b.startedAt - a.startedAt);
            return options?.limit ? summaries.slice(0, options.limit) : summaries;
          }),
        ),
    };
  }),
);

// ---------------------------------------------------------------------------
// NoopDispatchLog — no-op for when logging is not needed
// ---------------------------------------------------------------------------

export const NoopDispatchLog: Layer.Layer<DispatchLog> = Layer.succeed(DispatchLog)({
  record: () => Effect.void,
  snapshot: () => Effect.void,
  events: () => Effect.succeed([]),
  restore: () => Effect.succeed(undefined),
  list: () => Effect.succeed([]),
});
