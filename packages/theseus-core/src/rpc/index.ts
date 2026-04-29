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
  ControlWorkNode,
  CreateMission,
  GetCapsuleEvents,
  GetDispatchCapsuleEvents,
  GetDispatchEvents,
  GetMission,
  GetMissionWorkTree,
  GetResult,
  ListMissions,
  ListRuntimeDispatches,
  RpcError,
  StartMissionDispatch,
  StartResearchPoc,
  TheseusRpc,
} from "./procedures.ts";

export {
  CapsuleEventSchema,
  DispatchEventEntrySchema,
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
  WorkControlCommandSchema,
  WorkNodeSessionSchema,
} from "./schemas.ts";
