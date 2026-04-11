/**
 * Store — persistent backends for DispatchLog and Capsule.
 *
 * SQLite-backed (bun:sqlite) implementations. Swappable via Layer DI
 * with remote backends (Turso, Supabase, custom API) later.
 */

export { TheseusDb, TheseusDbLive } from "./sqlite.ts";
export { SqliteDispatchLog } from "./sqlite-dispatch-log.ts";
export { SqliteCapsuleLive } from "./sqlite-capsule.ts";
export { renderCapsule, renderFrictions, renderDecisions, renderTimeline } from "./capsule-render.ts";
