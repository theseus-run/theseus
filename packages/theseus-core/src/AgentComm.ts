/**
 * AgentComm — namespace barrel for `import * as AgentComm from "@theseus.run/core/AgentComm"`
 *
 * Cross-agent communication protocol. dispatchGruntTool dispatches one-shot
 * workers by blueprint name; report terminates with structured results.
 *
 * Usage:
 *   import * as AgentComm from "@theseus.run/core/AgentComm"
 *
 *   const tool = AgentComm.dispatchGruntTool
 */

// ---------------------------------------------------------------------------
// Types (already clean — no prefix to drop)
// ---------------------------------------------------------------------------

export type { DispatchGruntInput, ReportInput } from "./agent-comm/index.ts";

// ---------------------------------------------------------------------------
// Tools & factories
// ---------------------------------------------------------------------------

export { DispatchGruntFailed, dispatchGruntTool, report } from "./agent-comm/index.ts";
