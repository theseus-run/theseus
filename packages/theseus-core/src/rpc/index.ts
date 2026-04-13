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
  TheseusRpc,
  Dispatch,
  ListDispatches,
  GetMessages,
  Inject,
  Interrupt,
  GetResult,
  GetCapsuleEvents,
  Status,
  RpcError,
} from "./procedures.ts";

export {
  UsageSchema,
  MessageSchema,
  BlueprintSchema,
  SerializedToolRefSchema,
  AgentResultSchema,
  DispatchEventSchema,
  DispatchSummarySchema,
  CapsuleEventSchema,
  ResultKindSchema,
  SerializedToolCallErrorSchema,
} from "./schemas.ts";
