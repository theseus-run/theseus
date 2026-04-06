/**
 * Dispatch — the reusable LLM dispatch primitive.
 *
 * step()          — one LLM call (pure, no tool execution, no fiber/events)
 * dispatch()      — full machine: loop + events + injection + fiber handle
 * dispatchAwait() — convenience for callers that only need the result
 */

// Types
export type {
  DispatchEvent,
  DispatchHandle,
  Injection,
  StepResult,
  StepText,
  StepToolCalls,
  ToolCallResult,
} from "./types.ts";

// Step — pure, reusable independently
export {
  step,
  stepStream,
  extractToolDefs,
  tryParseArgs,
  runToolCall,
  runToolCalls,
  DEFAULT_LLM_RETRY_SCHEDULE,
} from "./step.ts";

// Dispatch — full machine
export { dispatch, dispatchAwait } from "./dispatch.ts";
