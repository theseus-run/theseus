/**
 * AgentComm — cross-agent communication protocol.
 *
 * theseus_delegate    — orchestrator dispatches worker with structured briefing
 * theseus_report      — worker terminates with structured result
 *
 * Capsule tools live under @theseus.run/core/Capsule.
 * Import <Briefing>, <WorkerPrompt> from "@theseus.run/core/agent-comm/briefing.tsx"
 */

// Compatibility export for existing callers; prefer Capsule.makeLogTool.
export { makeLogTool, makeReadCapsuleTool } from "./capsule-tools.ts";
export { makeDelegate } from "./delegate.ts";
// Tools
export { report } from "./report.ts";
// Types (pure, no jsx)
export type { DelegateInput, ReportInput } from "./types.ts";
