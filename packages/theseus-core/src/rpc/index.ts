/**
 * RPC — typed procedures and schemas for the Theseus protocol.
 *
 *   import * as Rpc from "@theseus.run/core/Rpc"
 *
 *   Rpc.TheseusRpc       // RpcGroup — full API surface
 *   Rpc.Dispatch          // streaming dispatch procedure
 *   Rpc.ListDispatches    // query procedure
 *   ...
 */

export {
  CreateMission,
  Dispatch,
  GetCapsuleEvents,
  GetDispatchCapsuleEvents,
  GetMessages,
  GetMission,
  GetResult,
  Inject,
  Interrupt,
  ListDispatches,
  ListMissions,
  ListRuntimeDispatches,
  RpcError,
  StartMissionDispatch,
  Status,
  TheseusRpc,
} from "./procedures.ts";

export {
  CapsuleEventSchema,
  DispatchEventSchema,
  DispatchOutputSchema,
  DispatchSessionSchema,
  DispatchSpecSchema,
  DispatchSummarySchema,
  MessageSchema,
  MissionSessionSchema,
  RuntimeDispatchEventSchema,
  SerializedToolCallErrorSchema,
  SerializedToolRefSchema,
  UsageSchema,
} from "./schemas.ts";
