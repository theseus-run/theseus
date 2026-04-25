/**
 * Capsule — namespace barrel for `import * as Capsule from "@theseus.run/core/Capsule"`
 *
 * The mission's append-only log. Exists for the human reviewing the voyage —
 * debugging, extracting improvement patterns, feeding the next mission.
 *
 * Usage:
 *   import * as Capsule from "@theseus.run/core/Capsule"
 *
 *   const layer = Capsule.CapsuleLive("my-mission")
 *   const capsule = yield* Capsule.Capsule
 *   yield* capsule.log({ type: "agent.note", by: "forge", data: { ... } })
 */

// ---------------------------------------------------------------------------
// Primary type (Effect service class)
// ---------------------------------------------------------------------------

export { Capsule } from "./capsule/index.ts";

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Capsule.*`)
// ---------------------------------------------------------------------------

export type { CapsuleEvent, CapsuleEventInput, CapsuleId } from "./capsule/index.ts";

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export { makeCapsuleId } from "./capsule/index.ts";
export { logCapsuleTool, readCapsuleTool } from "./capsule/tools.ts";

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export { CapsuleLive } from "./capsule/memory.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix)
// ---------------------------------------------------------------------------

export { CapsuleError } from "./capsule/index.ts";
