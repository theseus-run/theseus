/**
 * Grunt — namespace barrel for `import * as Grunt from "@theseus.run/core/Grunt"`
 *
 * Stateless, ephemeral LLM agent. Fire and forget. Fresh context per task,
 * no accumulated history. Default choice for getting work done.
 *
 * Usage:
 *   import * as Grunt from "@theseus.run/core/Grunt"
 *
 *   const handle = yield* Grunt.dispatch(blueprint, task)
 *   const result = yield* Grunt.dispatchAwait(blueprint, task)
 */

// ---------------------------------------------------------------------------
// Functions (already clean)
// ---------------------------------------------------------------------------

export { dispatch, dispatchAwait } from "./grunt/index.ts";

// ---------------------------------------------------------------------------
// Types (short alias)
// ---------------------------------------------------------------------------

export type { GruntHandle } from "./grunt/index.ts";
