/**
 * AgentComm — namespace barrel for `import * as AgentComm from "@theseus.run/core/AgentComm"`
 *
 * Cross-agent communication protocol. Delegate dispatches workers with
 * structured briefings, report terminates with structured results.
 *
 * Usage:
 *   import * as AgentComm from "@theseus.run/core/AgentComm"
 *
 *   const delegateTool = yield* AgentComm.makeDelegate(workerBlueprint)
 */

// ---------------------------------------------------------------------------
// Types (already clean — no prefix to drop)
// ---------------------------------------------------------------------------

export type { DelegateInput, ReportInput } from "./agent-comm/index.ts";

// ---------------------------------------------------------------------------
// Tools & factories
// ---------------------------------------------------------------------------

export { makeDelegate, report } from "./agent-comm/index.ts";
