/**
 * RPC — typed procedures and schemas for the Theseus protocol.
 *
 *   import * as Rpc from "@theseus.run/core/Rpc"
 *
 *   Rpc.TheseusRpc                 // RpcGroup — full API surface
 *   Rpc.StartMissionDispatch       // streaming runtime dispatch procedure
 *   Rpc.ListRuntimeDispatches      // runtime dispatch session query
 *   ...
 */

export {
  CreateMission,
  GetCapsuleEvents,
  GetDispatchCapsuleEvents,
  GetMission,
  GetMissionWorkTree,
  GetResult,
  Inject,
  Interrupt,
  ListMissions,
  ListRuntimeDispatches,
  RpcError,
  StartMissionDispatch,
  StartResearchPoc,
  Status,
  TheseusRpc,
} from "./procedures.ts";

export {
  CapsuleEventSchema,
  DispatchEventSchema,
  DispatchOutputSchema,
  DispatchSessionSchema,
  DispatchSpecSchema,
  MissionSessionSchema,
  ResearchPocEventSchema,
  RuntimeDispatchEventSchema,
  SerializedToolCallErrorSchema,
  SerializedToolRefSchema,
  UsageSchema,
  WorkNodeSessionSchema,
} from "./schemas.ts";
