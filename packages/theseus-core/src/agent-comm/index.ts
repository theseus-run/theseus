/**
 * AgentComm — cross-agent communication protocol.
 *
 * theseus_dispatch_grunt — commander issues a structured order to a grunt
 * theseus_report         — terminal protocol report packet
 */

export { DispatchGruntFailed, dispatchGruntTool } from "./dispatch-grunt.tsx";
export type { ProtocolEnvelope } from "./envelope.ts";
export { ProtocolEnvelopeSchema } from "./envelope.ts";
export type { Authority, Bounds, ContextBlock, DispatchGruntInput, Order } from "./order.ts";
export {
  AuthoritySchema,
  BoundsSchema,
  ContextBlockSchema,
  DispatchGruntInputSchema,
  OrderSchema,
} from "./order.ts";
export type {
  ArtifactRef,
  CriterionSatisfaction,
  Evidence,
  Followup,
  Report,
  ReportChannel,
} from "./report.ts";
export {
  ArtifactRefSchema,
  CriterionSatisfactionSchema,
  EvidenceSchema,
  FollowupSchema,
  ReportChannelSchema,
  ReportSchema,
  report,
} from "./report.ts";
export type { DispatchGruntResult, Salvage } from "./result.ts";
export { DispatchGruntResultSchema, SalvageSchema } from "./result.ts";
