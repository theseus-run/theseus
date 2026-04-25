/**
 * AgentComm — cross-agent communication protocol.
 *
 * theseus_dispatch_grunt — orchestrator dispatches a one-shot worker by blueprint name
 * theseus_report         — structured completion payload tool
 *
 * Import <Briefing>, <WorkerPrompt> from "@theseus.run/core/agent-comm/briefing.tsx"
 */

export { DispatchGruntFailed, dispatchGruntTool } from "./dispatch-grunt.tsx";
// Tools
export { report } from "./report.ts";
// Types (pure, no jsx)
export type { DispatchGruntInput, ReportInput } from "./types.ts";
