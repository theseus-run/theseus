/**
 * ToolPolicy — descriptive world-interaction metadata carried by every tool.
 */

// ---------------------------------------------------------------------------
// ToolInteraction
// ---------------------------------------------------------------------------

/**
 * World-interaction level for a tool.
 *
 * - `pure`              — closed-world transform, no ambient reads, no writes
 * - `observe`           — reads ambient state, no writes
 * - `write_idempotent`  — mutates, but repeating the same call converges safely
 * - `write`             — mutates, not safe to blindly retry
 * - `write_destructive` — lossy, irreversible, or arbitrarily dangerous mutation
 */
export type ToolInteraction =
  | "pure"
  | "observe"
  | "write_idempotent"
  | "write"
  | "write_destructive";

// ---------------------------------------------------------------------------
// ToolPolicy
// ---------------------------------------------------------------------------

export interface ToolPolicy {
  readonly interaction: ToolInteraction;
}
