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

// Types
export type {
  DispatchEvent,
  DispatchHandle,
  DispatchOptions,
  Injection,
  StepResult,
  StepText,
  StepToolCalls,
  ToolCall,
  ToolCallResult,
  Usage,
} from "./types.ts";

export type { ToolCallError } from "./types.ts";
export { ToolCallUnknown, ToolCallBadArgs, ToolCallFailed } from "./types.ts";

// Log — append-only audit/replay/restore
export { DispatchLog, InMemoryDispatchLog, NoopDispatchLog } from "./log.ts";
export type { EventEntry, Snapshot, DispatchSummary } from "./log.ts";

// Step — pure, reusable independently
export {
  step,
  stepStream,
  tryParseArgs,
  runToolCall,
} from "./step.ts";

export type { StreamDelta } from "./step.ts";

// Dispatch — full machine
export { dispatch, dispatchAwait } from "./dispatch.ts";

// Defaults — pre-composed layer for SatelliteRing + DispatchLog
export { DispatchDefaults } from "./defaults.ts";
