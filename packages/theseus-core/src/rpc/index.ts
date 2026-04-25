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
  Dispatch,
  GetCapsuleEvents,
  GetMessages,
  GetResult,
  Inject,
  Interrupt,
  ListDispatches,
  RpcError,
  Status,
  TheseusRpc,
} from "./procedures.ts";

export {
  CapsuleEventSchema,
  DispatchEventSchema,
  DispatchOutputSchema,
  DispatchSpecSchema,
  DispatchSummarySchema,
  MessageSchema,
  SerializedToolCallErrorSchema,
  SerializedToolRefSchema,
  UsageSchema,
} from "./schemas.ts";
