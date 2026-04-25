/**
 * SqliteDispatchStore — persistent DispatchStore backed by SQLite.
 *
 * Requires TheseusDb in the Layer.
 */

import * as Dispatch from "@theseus.run/core/Dispatch";
import { Clock, Effect, Layer } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { TheseusDb } from "./sqlite.ts";

export const SqliteDispatchStore: Layer.Layer<Dispatch.DispatchStore, never, TheseusDb> =
  Layer.effect(Dispatch.DispatchStore)(
    Effect.gen(function* () {
      const { db } = yield* TheseusDb;

      const upsertRecord = db.prepare(
        "INSERT INTO dispatch_records (dispatch_id, name, task, parent_dispatch_id) VALUES (?, ?, ?, ?) ON CONFLICT(dispatch_id) DO UPDATE SET name = excluded.name, task = excluded.task, parent_dispatch_id = excluded.parent_dispatch_id",
      );

      const insertEvent = db.prepare(
        "INSERT INTO dispatch_events (dispatch_id, timestamp, event_tag, event_json) VALUES (?, ?, ?, ?)",
      );

      const insertSnapshot = db.prepare(
        "INSERT INTO dispatch_snapshots (dispatch_id, iteration, timestamp, messages_json, usage_json) VALUES (?, ?, ?, ?, ?)",
      );

      const selectEvents = db.prepare(
        "SELECT dispatch_id, timestamp, event_json FROM dispatch_events WHERE dispatch_id = ? ORDER BY id",
      );

      const selectAllEvents = db.prepare(
        "SELECT dispatch_id, timestamp, event_json FROM dispatch_events ORDER BY id",
      );

      const selectLatestSnapshot = db.prepare(
        "SELECT dispatch_id, iteration, messages_json, usage_json FROM dispatch_snapshots WHERE dispatch_id = ? ORDER BY id DESC LIMIT 1",
      );

      const selectParentLink = db.prepare(
        "SELECT event_json FROM dispatch_events WHERE dispatch_id = ? AND event_tag = 'Injected' LIMIT 1",
      );

      const selectDispatchList = db.prepare(`
        SELECT
          r.dispatch_id,
          r.name,
          r.task,
          MIN(e.timestamp) as started_at,
          MAX(CASE WHEN e.event_tag = 'Done' THEN e.timestamp END) as completed_at,
          MAX(CASE WHEN e.event_tag = 'Done' THEN e.event_json END) as done_json
        FROM dispatch_records r
        LEFT JOIN dispatch_events e ON e.dispatch_id = r.dispatch_id
        GROUP BY r.dispatch_id, r.name, r.task
        ORDER BY COALESCE(MIN(e.timestamp), 0) DESC
        LIMIT ?
      `);

      return {
        create: (input: Dispatch.DispatchCreate) =>
          Effect.gen(function* () {
            const id =
              input.requestedId !== undefined
                ? (input.requestedId as Dispatch.DispatchId)
                : yield* Dispatch.makeDispatchId(input.name);
            const record: Dispatch.DispatchRecord = {
              id,
              name: input.name,
              task: input.task,
              ...(input.parentDispatchId !== undefined
                ? { parentDispatchId: input.parentDispatchId }
                : {}),
            };
            upsertRecord.run(id, input.name, input.task, input.parentDispatchId ?? null);
            return record;
          }),

        record: (dispatchId: string, event: Dispatch.DispatchEvent) =>
          Effect.gen(function* () {
            const timestamp = yield* Clock.currentTimeMillis;
            insertEvent.run(dispatchId, timestamp, event._tag, JSON.stringify(event));
          }),

        snapshot: (
          dispatchId: string,
          iteration: number,
          messages: ReadonlyArray<Prompt.MessageEncoded>,
          usage: Dispatch.Usage,
        ) =>
          Effect.gen(function* () {
            const timestamp = yield* Clock.currentTimeMillis;
            insertSnapshot.run(
              dispatchId,
              iteration,
              timestamp,
              JSON.stringify(messages),
              JSON.stringify(usage),
            );
          }),

        events: (dispatchId?: string) =>
          Effect.sync(() => {
            const rows = dispatchId
              ? (selectEvents.all(dispatchId) as Array<{
                  dispatch_id: string;
                  timestamp: number;
                  event_json: string;
                }>)
              : (selectAllEvents.all() as Array<{
                  dispatch_id: string;
                  timestamp: number;
                  event_json: string;
                }>);
            return rows.map((row) => ({
              dispatchId: row.dispatch_id,
              timestamp: row.timestamp,
              event: JSON.parse(row.event_json) as Dispatch.DispatchEvent,
            }));
          }),

        restore: (dispatchId: string) =>
          Effect.sync(() => {
            const row = selectLatestSnapshot.get(dispatchId) as {
              dispatch_id: string;
              iteration: number;
              messages_json: string;
              usage_json: string;
            } | null;
            if (!row) return undefined;

            // Look for parent link
            const linkRow = selectParentLink.get(dispatchId) as { event_json: string } | null;
            let parentDispatchId: string | undefined;
            if (linkRow) {
              const event = JSON.parse(linkRow.event_json);
              if (event.injection === "ParentLink" && event.detail) {
                parentDispatchId = event.detail;
              }
            }

            const opts: Dispatch.DispatchOptions = {
              dispatchId,
              messages: JSON.parse(row.messages_json),
              iteration: row.iteration,
              usage: JSON.parse(row.usage_json),
            };
            return parentDispatchId !== undefined ? { ...opts, parentDispatchId } : opts;
          }),

        list: (options?: { limit?: number }) =>
          Effect.sync(() => {
            const limit = options?.limit ?? 100;
            const rows = selectDispatchList.all(limit) as Array<{
              dispatch_id: string;
              name: string;
              task: string;
              started_at: number | null;
              completed_at: number | null;
              done_json: string | null;
            }>;
            return rows.map((row): Dispatch.DispatchSummary => {
              const doneEvent = row.done_json ? JSON.parse(row.done_json) : null;
              const result = doneEvent?.result;
              return {
                dispatchId: row.dispatch_id,
                name: row.name,
                task: row.task,
                startedAt: row.started_at ?? 0,
                completedAt: row.completed_at,
                status: row.completed_at ? "done" : "running",
                usage: result?.usage ?? { inputTokens: 0, outputTokens: 0 },
              };
            });
          }),
      };
    }),
  );
