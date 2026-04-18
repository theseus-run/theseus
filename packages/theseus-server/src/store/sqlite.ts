/**
 * TheseusDb — shared SQLite connection for DispatchLog + Capsule.
 *
 * Single DB file at `{workspace}/.theseus/theseus.db`.
 * Uses `bun:sqlite` (built-in, zero dependencies).
 *
 * Two consumers:
 *   - SqliteDispatchLog — drop-in Layer for DispatchLog
 *   - SqliteCapsule     — drop-in Layer for Capsule
 *
 * Both use the same connection. WAL mode for concurrent reads.
 */

import { Database } from "bun:sqlite";
import { Context, Effect, Layer } from "effect";

// ---------------------------------------------------------------------------
// TheseusDb — shared service for the SQLite connection
// ---------------------------------------------------------------------------

export class TheseusDb extends Context.Service<
  TheseusDb,
  {
    readonly db: Database;
  }
>()("TheseusDb") {}

// ---------------------------------------------------------------------------
// Schema — applied on first connection
// ---------------------------------------------------------------------------

const SCHEMA = `
  -- DispatchLog events
  CREATE TABLE IF NOT EXISTS dispatch_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispatch_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    event_tag TEXT NOT NULL,
    event_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dispatch_events_id ON dispatch_events(dispatch_id);

  -- DispatchLog message snapshots
  CREATE TABLE IF NOT EXISTS dispatch_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispatch_id TEXT NOT NULL,
    iteration INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    messages_json TEXT NOT NULL,
    usage_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dispatch_snapshots_id ON dispatch_snapshots(dispatch_id);

  -- Capsule events
  CREATE TABLE IF NOT EXISTS capsule_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capsule_id TEXT NOT NULL,
    type TEXT NOT NULL,
    at TEXT NOT NULL,
    by TEXT NOT NULL,
    data_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_capsule_events_id ON capsule_events(capsule_id);

  -- Capsule artifacts
  CREATE TABLE IF NOT EXISTS capsule_artifacts (
    capsule_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (capsule_id, name)
  );
`;

// ---------------------------------------------------------------------------
// TheseusDbLive — open/create DB at a given path
// ---------------------------------------------------------------------------

export const TheseusDbLive = (dbPath: string): Layer.Layer<TheseusDb> =>
  Layer.effect(TheseusDb)(
    Effect.sync(() => {
      const db = new Database(dbPath, { create: true });
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA foreign_keys = ON");
      db.exec(SCHEMA);
      return { db };
    }),
  );
