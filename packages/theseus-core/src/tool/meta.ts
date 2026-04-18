/**
 * ToolPolicy — ordered world-interaction policy carried by every tool.
 *
 * Policy is inert on its own; runtimes read it to decide things like
 * "may this tool run in observe-only mode?" or "what is the default retry
 * posture for this tool?".
 */

// ---------------------------------------------------------------------------
// ToolInteraction — ordered from least to most dangerous
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

const INTERACTION_ORDER: Record<ToolInteraction, number> = {
  pure: 0,
  observe: 1,
  write_idempotent: 2,
  write: 3,
  write_destructive: 4,
};

/** Compare two interaction levels. Negative if a < b, 0 if equal, positive if a > b. */
export const compareInteraction = (a: ToolInteraction, b: ToolInteraction): number =>
  INTERACTION_ORDER[a] - INTERACTION_ORDER[b];

/** Is interaction `a` at most as dangerous as `max`? */
export const interactionAtMost = (a: ToolInteraction, max: ToolInteraction): boolean =>
  compareInteraction(a, max) <= 0;

// ---------------------------------------------------------------------------
// ToolPolicy
// ---------------------------------------------------------------------------

export interface ToolPolicy {
  readonly interaction: ToolInteraction;
}
