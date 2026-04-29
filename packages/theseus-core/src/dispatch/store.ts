/**
 * DispatchStore — collection boundary for dispatch records.
 *
 * Owns dispatch creation, identity, raw event journaling, snapshots, restore,
 * and listing. Current execution receives the active record through
 * `CurrentDispatch`.
 */

import { Clock, Context, Data, Effect, Layer, Random, Ref } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { ModelRequest } from "./model-gateway.ts";
import type { DispatchEvent, DispatchOptions, Usage } from "./types.ts";

export type DispatchId = string & { readonly _brand: unique symbol };

export class DispatchStoreDecodeFailed extends Data.TaggedError("DispatchStoreDecodeFailed")<{
  readonly source: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export interface DispatchCreate {
  readonly name: string;
  readonly task: string;
  readonly parentDispatchId?: string;
  readonly modelRequest?: ModelRequest;
  readonly requestedId?: string;
}

export interface DispatchRecord {
  readonly id: DispatchId;
  readonly name: string;
  readonly task: string;
  readonly parentDispatchId?: string;
  readonly modelRequest?: ModelRequest;
}

export interface DispatchEventEntry {
  readonly timestamp: number;
  readonly dispatchId: string;
  readonly event: DispatchEvent;
}

export interface DispatchSnapshot {
  readonly timestamp: number;
  readonly dispatchId: string;
  readonly iteration: number;
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
  readonly usage: Usage;
}

export interface DispatchSummary {
  readonly dispatchId: string;
  readonly parentDispatchId?: string;
  readonly modelRequest?: ModelRequest;
  readonly name: string;
  readonly task: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly status: "running" | "done" | "failed";
  readonly usage: Usage;
}

export class DispatchStore extends Context.Service<
  DispatchStore,
  {
    readonly create: (input: DispatchCreate) => Effect.Effect<DispatchRecord>;
    readonly record: (dispatchId: string, event: DispatchEvent) => Effect.Effect<void>;
    readonly snapshot: (
      dispatchId: string,
      iteration: number,
      messages: ReadonlyArray<Prompt.MessageEncoded>,
      usage: Usage,
    ) => Effect.Effect<void>;
    readonly events: (
      dispatchId?: string,
    ) => Effect.Effect<ReadonlyArray<DispatchEventEntry>, DispatchStoreDecodeFailed>;
    readonly restore: (
      dispatchId: string,
    ) => Effect.Effect<DispatchOptions | undefined, DispatchStoreDecodeFailed>;
    readonly list: (options?: {
      readonly limit?: number;
    }) => Effect.Effect<ReadonlyArray<DispatchSummary>, DispatchStoreDecodeFailed>;
  }
>()("DispatchStore") {}

export class CurrentDispatch extends Context.Service<CurrentDispatch, DispatchRecord>()(
  "CurrentDispatch",
) {}

export const makeDispatchId = (name: string): Effect.Effect<DispatchId> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const rand = yield* Random.nextIntBetween(0, 36 ** 5 - 1);
    return `${name}-${now.toString(36)}-${rand.toString(36).padStart(5, "0")}` as DispatchId;
  });

export const InMemoryDispatchStore: Layer.Layer<DispatchStore> = Layer.effect(DispatchStore)(
  Effect.gen(function* () {
    const recordsRef = yield* Ref.make<ReadonlyMap<string, DispatchRecord>>(new Map());
    const eventsRef = yield* Ref.make<ReadonlyArray<DispatchEventEntry>>([]);
    const snapshotsRef = yield* Ref.make<ReadonlyArray<DispatchSnapshot>>([]);

    return {
      create: (input) =>
        Effect.gen(function* () {
          const id =
            input.requestedId !== undefined
              ? (input.requestedId as DispatchId)
              : yield* makeDispatchId(input.name);
          const record: DispatchRecord = {
            id,
            name: input.name,
            task: input.task,
            ...(input.parentDispatchId !== undefined
              ? { parentDispatchId: input.parentDispatchId }
              : {}),
            ...(input.modelRequest !== undefined ? { modelRequest: input.modelRequest } : {}),
          };
          yield* Ref.update(recordsRef, (records) => new Map([...records, [id, record]]));
          return record;
        }),

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
          const latest = matching[matching.length - 1];
          if (latest === undefined) return undefined;

          const records = yield* Ref.get(recordsRef);
          const record = records.get(dispatchId);
          const opts: DispatchOptions = {
            dispatchId,
            messages: latest.messages,
            iteration: latest.iteration,
            usage: latest.usage,
          };
          return record?.parentDispatchId !== undefined
            ? { ...opts, parentDispatchId: record.parentDispatchId }
            : opts;
        }),

      list: (options) =>
        Effect.gen(function* () {
          const records = yield* Ref.get(recordsRef);
          const entries = yield* Ref.get(eventsRef);
          const summaries: DispatchSummary[] = [];

          for (const record of records.values()) {
            const dispatchEvents = entries.filter((entry) => entry.dispatchId === record.id);
            const first = dispatchEvents[0];
            if (first === undefined) continue;
            const done = dispatchEvents.find((entry) => entry.event._tag === "Done");
            const failed = dispatchEvents.find((entry) => entry.event._tag === "Failed");
            summaries.push({
              dispatchId: record.id,
              ...(record.parentDispatchId !== undefined
                ? { parentDispatchId: record.parentDispatchId }
                : {}),
              ...(record.modelRequest !== undefined ? { modelRequest: record.modelRequest } : {}),
              name: record.name,
              task: record.task,
              startedAt: first.timestamp,
              completedAt: done?.timestamp ?? failed?.timestamp ?? null,
              status: done ? "done" : failed ? "failed" : "running",
              usage:
                done?.event._tag === "Done"
                  ? done.event.result.usage
                  : { inputTokens: 0, outputTokens: 0 },
            });
          }

          summaries.sort((a, b) => b.startedAt - a.startedAt);
          return options?.limit ? summaries.slice(0, options.limit) : summaries;
        }),
    };
  }),
);
