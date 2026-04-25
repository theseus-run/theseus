/**
 * AgentComm — cross-agent communication protocol.
 *
 * theseus_delegate    — orchestrator dispatches worker with structured briefing
 * theseus_report      — worker terminates with structured result
 *
 * Import <Briefing>, <WorkerPrompt> from "@theseus.run/core/agent-comm/briefing.tsx"
 */

export { makeDelegate } from "./delegate.ts";
// Tools
export { report } from "./report.ts";
// Types (pure, no jsx)
export type { DelegateInput, ReportInput } from "./types.ts";
