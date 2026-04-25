/**
 * Dispatch — raw LLM/tool loop primitive.
 *
 * step()          — one LLM call (pure, no tool execution, no fiber/events)
 * dispatch()      — full machine: loop + events + injection + fiber handle
 * dispatchAwait() — convenience for callers that only need the result
 *
 * Uses LanguageModel from effect/unstable/ai.
 */

// Defaults — pre-composed layer for SatelliteRing + DispatchStore
export { DispatchDefaults } from "./defaults.ts";
// Dispatch — full machine
export { dispatch, dispatchAwait } from "./dispatch.ts";
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
