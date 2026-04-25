/**
 * Dispatch — raw LLM/tool loop primitive.
 *
 * step()          — one LLM call (pure, no tool execution, no fiber/events)
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

// Step — pure, reusable independently
export {
  runToolCall,
  step,
  tryParseArgs,
} from "./step.ts";
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
