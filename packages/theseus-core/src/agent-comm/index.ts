/**
 * AgentComm — cross-agent communication protocol.
 *
 * theseus_delegate    — orchestrator dispatches worker with structured briefing
 * theseus_report      — worker terminates with structured result
 * theseus_log         — any agent logs to Capsule
 * theseus_read_capsule — any agent reads Capsule trail
 *
 * jsx-md components and makeDelegate are in .tsx files.
 * Import makeDelegate from "@theseus.run/core/agent-comm/delegate.tsx"
 * Import <Briefing>, <WorkerPrompt> from "@theseus.run/core/agent-comm/briefing.tsx"
 */

// Types (pure, no jsx)
export type { DelegateInput, ReportInput } from "./types.ts";

// Tools
export { report } from "./report.ts";
export { makeDelegate } from "./delegate.ts";
export { makeLogTool, makeReadCapsuleTool } from "./capsule-tools.ts";
