/**
 * Grunt — namespace barrel for `import * as Grunt from "@theseus.run/core/Grunt"`
 *
 * Lightweight semantic adapter over raw Dispatch. A grunt runs an
 * Agent.Blueprint through Dispatch and maps raw dispatch output/errors into
 * AgentResult/AgentError.
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
