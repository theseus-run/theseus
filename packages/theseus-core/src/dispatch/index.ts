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
  Injection,
  StepResult,
  StepText,
  StepToolCalls,
  ToolCall,
  ToolCallResult,
  Usage,
} from "./types.ts";

// Step — pure, reusable independently
export {
  step,
  stepStream,
  tryParseArgs,
  runToolCall,
  runToolCalls,
} from "./step.ts";

export type { StreamDelta } from "./step.ts";

// Dispatch — full machine
export { dispatch, dispatchAwait } from "./dispatch.ts";
