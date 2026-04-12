/**
 * SqliteDispatchLog — persistent DispatchLog backed by SQLite.
 *
 * Drop-in replacement for InMemoryDispatchLog / NoopDispatchLog.
 * Requires TheseusDb in the Layer.
 */

import { Effect, Layer } from "effect";
import * as Dispatch from "@theseus.run/core/Dispatch";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { TheseusDb } from "./sqlite.ts";

export const SqliteDispatchLog: Layer.Layer<Dispatch.Log, never, TheseusDb> =
  Layer.effect(Dispatch.Log)(
    Effect.gen(function* () {
      const { db } = yield* TheseusDb;

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
          dispatch_id,
          MIN(timestamp) as started_at,
          MAX(CASE WHEN event_tag = 'Done' THEN timestamp END) as completed_at,
          MAX(CASE WHEN event_tag = 'Calling' THEN json_extract(event_json, '$.agent') END) as agent,
          MAX(CASE WHEN event_tag = 'Done' THEN event_json END) as done_json
        FROM dispatch_events
        GROUP BY dispatch_id
        ORDER BY MIN(timestamp) DESC
        LIMIT ?
      `);

      return {
        record: (dispatchId: string, event: Dispatch.Event) =>
          Effect.sync(() => {
            insertEvent.run(dispatchId, Date.now(), event._tag, JSON.stringify(event));
          }),

        snapshot: (
          dispatchId: string,
          iteration: number,
          messages: ReadonlyArray<Prompt.MessageEncoded>,
          usage: Dispatch.Usage,
        ) =>
          Effect.sync(() => {
            insertSnapshot.run(dispatchId, iteration, Date.now(), JSON.stringify(messages), JSON.stringify(usage));
          }),

        events: (dispatchId?: string) =>
          Effect.sync(() => {
            const rows = dispatchId
              ? (selectEvents.all(dispatchId) as Array<{ dispatch_id: string; timestamp: number; event_json: string }>)
              : (selectAllEvents.all() as Array<{ dispatch_id: string; timestamp: number; event_json: string }>);
            return rows.map((row) => ({
              dispatchId: row.dispatch_id,
              timestamp: row.timestamp,
              event: JSON.parse(row.event_json) as Dispatch.Event,
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

            const opts: Dispatch.Options = {
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
              started_at: number;
              completed_at: number | null;
              agent: string | null;
              done_json: string | null;
            }>;
            return rows.map((row): Dispatch.DispatchSummary => {
              const doneEvent = row.done_json ? JSON.parse(row.done_json) : null;
              const result = doneEvent?.result;
              return {
                dispatchId: row.dispatch_id,
                agent: row.agent ?? "",
                task: "",
                startedAt: row.started_at,
                completedAt: row.completed_at,
                status: row.completed_at ? "done" : "running",
                usage: result?.usage ?? { inputTokens: 0, outputTokens: 0 },
              };
            });
          }),
      };
    }),
  );
