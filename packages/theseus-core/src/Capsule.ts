/**
 * Capsule — namespace barrel for `import * as Capsule from "@theseus.run/core/Capsule"`
 *
 * The mission's append-only log. Exists for the human reviewing the voyage —
 * debugging, extracting improvement patterns, feeding the next mission.
 *
 * Usage:
 *   import * as Capsule from "@theseus.run/core/Capsule"
 *
 *   const layer = Capsule.Live("my-mission")
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

export type {
  CapsuleEvent as Event,
  CapsuleEventInput as EventInput,
  CapsuleId as Id,
} from "./capsule/index.ts";

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export { makeCapsuleId as makeId } from "./capsule/index.ts";
export { logCapsuleTool as logTool, readCapsuleTool as readTool } from "./capsule/tools.ts";

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export { CapsuleLive as Live } from "./capsule/memory.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix)
// ---------------------------------------------------------------------------

export { CapsuleError } from "./capsule/index.ts";
