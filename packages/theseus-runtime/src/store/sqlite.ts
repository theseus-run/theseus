/**
 * TheseusDb — shared SQLite connection for DispatchStore + Capsule.
 *
 * Single DB file at `{workspace}/.theseus/theseus.db`.
 * Uses `bun:sqlite` (built-in, zero dependencies).
 *
 * Two consumers:
 *   - SqliteDispatchStore — persistent DispatchStore layer
 *   - SqliteCapsule     — drop-in Layer for Capsule
 *
 * Both use the same connection. WAL mode for concurrent reads.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
  -- Dispatch records
  CREATE TABLE IF NOT EXISTS dispatch_records (
    dispatch_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    task TEXT NOT NULL,
    parent_dispatch_id TEXT,
    model_request_json TEXT
  );

  -- Dispatch events
  CREATE TABLE IF NOT EXISTS dispatch_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispatch_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    event_tag TEXT NOT NULL,
    event_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dispatch_events_id ON dispatch_events(dispatch_id);

  -- Dispatch message snapshots
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

  -- Runtime session links. Mission state remains capsule-backed; these tables
  -- only make identity joins cheap and unambiguous.
  CREATE TABLE IF NOT EXISTS runtime_mission_capsules (
    mission_id TEXT PRIMARY KEY,
    capsule_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runtime_dispatch_sessions (
    dispatch_id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL,
    capsule_id TEXT NOT NULL
  );
`;

const ensureColumn = (db: Database, table: string, column: string, definition: string): void => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

// ---------------------------------------------------------------------------
// TheseusDbLive — open/create DB at a given path
// ---------------------------------------------------------------------------

export const TheseusDbLive = (dbPath: string): Layer.Layer<TheseusDb> =>
  Layer.effect(TheseusDb)(
    Effect.sync(() => {
      mkdirSync(dirname(dbPath), { recursive: true });
      const db = new Database(dbPath, { create: true });
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA foreign_keys = ON");
      db.exec(SCHEMA);
      ensureColumn(db, "dispatch_records", "model_request_json", "TEXT");
      return { db };
    }),
  );
