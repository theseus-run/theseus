/**
 * AgentComm — namespace barrel for `import * as AgentComm from "@theseus.run/core/AgentComm"`
 *
 * Cross-agent communication protocol. dispatchGruntTool issues structured
 * orders to runtime-owned grunts; report defines the terminal packet.
 *
 * Usage:
 *   import * as AgentComm from "@theseus.run/core/AgentComm"
 *
 *   const tool = AgentComm.dispatchGruntTool
 */

// Protocol types

export type {
  ArtifactRef,
  Authority,
  Bounds,
  ContextBlock,
  CriterionSatisfaction,
  DispatchGruntInput,
  DispatchGruntResult,
  Evidence,
  Followup,
  Order,
  ProtocolEnvelope,
  Report,
  ReportChannel,
  Salvage,
} from "./agent-comm/index.ts";
export {
  ArtifactRefSchema,
  AuthoritySchema,
  BoundsSchema,
  ContextBlockSchema,
  CriterionSatisfactionSchema,
  DispatchGruntInputSchema,
  DispatchGruntResultSchema,
  EvidenceSchema,
  FollowupSchema,
  OrderSchema,
  ProtocolEnvelopeSchema,
  ReportChannelSchema,
  ReportSchema,
  SalvageSchema,
} from "./agent-comm/index.ts";

// Tools

export type { DispatchGruntLaunchInput } from "./agent-comm/index.ts";
export {
  DispatchGruntFailed,
  DispatchGruntLauncher,
  DispatchGruntLauncherLive,
  dispatchGruntTool,
  report,
} from "./agent-comm/index.ts";
