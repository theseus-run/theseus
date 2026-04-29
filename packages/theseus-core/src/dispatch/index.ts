/**
 * Dispatch — raw LLM/tool loop primitive.
 *
 * step()          — one LLM call (pure, no tool execution, no fiber/events)
 * dispatch()      — full machine: loop + events + injection + fiber handle
 * dispatchAwait() — convenience for callers that only need the result
 *
 * Uses LanguageModel from effect/unstable/ai.
 */

export type { DispatchControlGate, DispatchControlState } from "./control.ts";
export { makeDispatchControlGate, NoopDispatchControlGate } from "./control.ts";
export type {
  CortexAuthority,
  CortexDiff,
  CortexFrame,
  CortexNode,
  CortexNodeId,
  CortexRenderInput,
  CortexService,
  CortexSignal,
  CortexSignalId,
  CortexSlot,
} from "./cortex.ts";
export { Cortex, CortexDiffs, CortexSignals, CortexStack, NoopCortex } from "./cortex.ts";
// Defaults — pre-composed layer for SatelliteRing + DispatchStore
export { DispatchDefaults } from "./defaults.ts";
// Dispatch — full machine
export { dispatch, dispatchAwait } from "./dispatch.ts";
export type { CopilotModelRequest, ModelRequest, OpenAIModelRequest } from "./model-gateway.ts";
export {
  LanguageModelGateway,
  LanguageModelGatewayFromLanguageModel,
  ModelUnavailable,
} from "./model-gateway.ts";
// Step — pure, reusable independently
export {
  runToolCall,
  step,
  tryParseArgs,
} from "./step.ts";
export type {
  DispatchCreate,
  DispatchEventEntry,
  DispatchId,
  DispatchRecord,
  DispatchSnapshot,
  DispatchSummary,
} from "./store.ts";
export {
  CurrentDispatch,
  DispatchStore,
  DispatchStoreDecodeFailed,
  InMemoryDispatchStore,
  makeDispatchId,
} from "./store.ts";
// Types
export type {
  DispatchError,
  DispatchEvent,
  DispatchHandle,
  DispatchOptions,
  DispatchOutput,
  DispatchSpec,
  Injection,
  StepResult,
  ToolCall,
  ToolCallError,
  ToolCallResult,
  Usage,
} from "./types.ts";
export {
  DispatchCycleExceeded,
  DispatchInterrupted,
  DispatchModelFailed,
  DispatchOutputSchema,
  DispatchToolFailed,
  ToolCallBadArgs,
  ToolCallFailed,
  ToolCallUnknown,
  UsageSchema,
} from "./types.ts";
