/**
 * SqliteCurrentCapsuleLive — persistent CurrentCapsule backed by SQLite.
 *
 * Persistent implementation of the CurrentCapsule service.
 * Requires TheseusDb in the Layer.
 *
 * Events and artifacts persisted in theseus.db.
 */

import * as CapsuleNs from "@theseus.run/core/Capsule";
import { Clock, Effect, Layer } from "effect";
import { TheseusDb } from "./sqlite.ts";

export const SqliteCurrentCapsuleLive = (
  slug: string,
): Layer.Layer<CapsuleNs.CurrentCapsule, never, TheseusDb> =>
  Layer.effect(CapsuleNs.CurrentCapsule)(
    Effect.gen(function* () {
      const id = yield* CapsuleNs.makeCapsuleId(slug);
      const { db } = yield* TheseusDb;

      const insertEvent = db.prepare(
        "INSERT INTO capsule_events (capsule_id, type, at, by, data_json) VALUES (?, ?, ?, ?, ?)",
      );

      const selectEvents = db.prepare(
        "SELECT type, at, by, data_json FROM capsule_events WHERE capsule_id = ? ORDER BY id",
      );

      const upsertArtifact = db.prepare(
        "INSERT INTO capsule_artifacts (capsule_id, name, content) VALUES (?, ?, ?) ON CONFLICT(capsule_id, name) DO UPDATE SET content = excluded.content",
      );

      const selectArtifact = db.prepare(
        "SELECT content FROM capsule_artifacts WHERE capsule_id = ? AND name = ?",
      );

      return CapsuleNs.CurrentCapsule.of({
        id,

        log: (input: CapsuleNs.CapsuleEventInput) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const at = new Date(now).toISOString();
            insertEvent.run(id, input.type, at, input.by, JSON.stringify(input.data));
          }),

        read: () =>
          Effect.sync(() =>
            (
              selectEvents.all(id) as Array<{
                type: string;
                at: string;
                by: string;
                data_json: string;
              }>
            ).map(
              (row): CapsuleNs.CapsuleEvent => ({
                type: row.type,
                at: row.at,
                by: row.by,
                data: JSON.parse(row.data_json),
              }),
            ),
          ),

        artifact: (name: string, content: string) =>
          Effect.sync(() => {
            upsertArtifact.run(id, name, content);
          }),

        readArtifact: (name: string) =>
          Effect.gen(function* () {
            const row = selectArtifact.get(id, name) as { content: string } | null;
            if (!row) {
              return yield* Effect.fail(
                new CapsuleNs.CapsuleError({ capsule: id, message: `Artifact not found: ${name}` }),
              );
            }
            return row.content;
          }),
      });
    }),
  );
