/**
 * SqliteCapsuleLive — persistent Capsule backed by SQLite.
 *
 * Drop-in replacement for CapsuleLive (Ref-backed in-memory).
 * Requires TheseusDb in the Layer.
 *
 * Same interface: log, read, artifact, readArtifact.
 * Events and artifacts persisted in theseus.db.
 */

import { Effect, Layer } from "effect";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import { TheseusDb } from "./sqlite.ts";

export const SqliteCapsuleLive = (slug: string): Layer.Layer<CapsuleNs.Capsule, never, TheseusDb> =>
  Layer.effect(CapsuleNs.Capsule)(
    Effect.gen(function* () {
      const id = yield* CapsuleNs.makeId(slug);
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

      return CapsuleNs.Capsule.of({
        id,

        log: (input: CapsuleNs.EventInput) =>
          Effect.sync(() => {
            const at = new Date().toISOString();
            insertEvent.run(id, input.type, at, input.by, JSON.stringify(input.data));
          }),

        read: () =>
          Effect.sync(() =>
            (selectEvents.all(id) as Array<{ type: string; at: string; by: string; data_json: string }>).map(
              (row): CapsuleNs.Event => ({
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
