/**
 * ToolMeta — policy metadata carried by every tool.
 *
 * Metadata is inert on its own; a runtime (policy engine, UI, retry loop)
 * reads it to decide things like "may this tool run in readonly mode?",
 * "is it safe to retry?", "should this be hidden from the model?".
 */

// ---------------------------------------------------------------------------
// Mutation — ordered permission level
//
// Ordering matters: a policy allowing "write" must also allow "idempotent"
// and "readonly". `compareMutation` supplies the ordering.
// ---------------------------------------------------------------------------

/**
 * Mutation level — ordered from least to most dangerous.
 *
 * - `readonly`    — no state change (read a file, query an API)
 * - `idempotent`  — state change but safe to repeat (PUT, upsert, set-to-value)
 * - `write`       — state change, not safe to blindly repeat (POST, append, increment)
 * - `destructive` — irreversible state change (delete, drop table, rm -rf)
 */
export type Mutation = "readonly" | "idempotent" | "write" | "destructive";

const MUTATION_ORDER: Record<Mutation, number> = {
  readonly: 0,
  idempotent: 1,
  write: 2,
  destructive: 3,
};

/** Compare two mutation levels. Negative if a < b, 0 if equal, positive if a > b. */
export const compareMutation = (a: Mutation, b: Mutation): number =>
  MUTATION_ORDER[a] - MUTATION_ORDER[b];

/** Is mutation `a` at most as dangerous as `max`? */
export const mutationAtMost = (a: Mutation, max: Mutation): boolean => compareMutation(a, max) <= 0;

// ---------------------------------------------------------------------------
// ToolMeta
// ---------------------------------------------------------------------------

export interface ToolMeta {
  readonly mutation: Mutation;
  /** Tool consults external, non-deterministic state (network, LLMs, clock) — affects caching. */
  readonly openWorld?: boolean;
}
