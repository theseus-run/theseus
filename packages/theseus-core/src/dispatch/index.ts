/**
 * Dispatch — the reusable LLM dispatch primitive.
 *
 * step()          — one LLM call (pure, no tool execution, no fiber/events)
 * stepStream()    — streaming LLM call with delta callbacks
 * dispatch()      — full machine: loop + events + injection + fiber handle
 * dispatchAwait() — convenience for callers that only need the result
 *
 * Uses LanguageModel from effect/unstable/ai.
 */

// Defaults — pre-composed layer for SatelliteRing + DispatchLog
export { DispatchDefaults } from "./defaults.ts";
// Dispatch — full machine
export { dispatch, dispatchAwait } from "./dispatch.ts";
export type { DispatchSummary, EventEntry, Snapshot } from "./log.ts";

// Log — append-only audit/replay/restore
export { DispatchLog, InMemoryDispatchLog, NoopDispatchLog } from "./log.ts";
export type { StreamDelta } from "./step.ts";

// Step — pure, reusable independently
export {
  runToolCall,
  step,
  stepStream,
  tryParseArgs,
} from "./step.ts";
// Types
export type {
  DispatchError,
  DispatchEvent,
  DispatchHandle,
  DispatchOptions,
  DispatchOutput,
  Injection,
  StepResult,
  StepText,
  StepToolCalls,
  ToolCall,
  ToolCallError,
  ToolCallResult,
  Usage,
} from "./types.ts";
export {
  DispatchCycleExceeded,
  DispatchInterrupted,
  DispatchModelFailed,
  ToolCallBadArgs,
  ToolCallFailed,
  ToolCallUnknown,
} from "./types.ts";
