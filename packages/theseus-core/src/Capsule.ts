/**
 * Capsule — namespace barrel for `import * as Capsule from "@theseus.run/core/Capsule"`
 *
 * Memory/log substrate for missions and runtimes. Capsule is append-only event
 * history plus artifacts; higher-level protocols decide what to record.
 *
 * Usage:
 *   import * as Capsule from "@theseus.run/core/Capsule"
 *
 *   const layer = Capsule.CurrentCapsuleLive("my-mission")
 *   const capsule = yield* Capsule.CurrentCapsule
 *   yield* capsule.log({ type: "mission.note", by: "runtime", data: { ... } })
 */

// ---------------------------------------------------------------------------
// Primary type (Effect service class)
// ---------------------------------------------------------------------------

export { CurrentCapsule } from "./capsule/index.ts";

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Capsule.*`)
// ---------------------------------------------------------------------------

export type { CapsuleEvent, CapsuleEventInput, CapsuleId, CapsuleRecord } from "./capsule/index.ts";
export type { CapsuleCreate } from "./capsule/store.ts";

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export { makeCapsuleId } from "./capsule/index.ts";
export { logCapsuleTool, readCapsuleTool } from "./capsule/tools.ts";

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export {
  CapsuleStore,
  CurrentCapsuleLive,
  InMemoryCapsuleStore,
  makeInMemoryCapsuleRecord,
} from "./capsule/store.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix)
// ---------------------------------------------------------------------------

export { CapsuleError } from "./capsule/index.ts";
