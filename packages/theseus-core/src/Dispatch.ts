/**
 * Dispatch — namespace barrel for `import * as Dispatch from "@theseus.run/core/Dispatch"`
 *
 * The atomic AI invocation unit. Give it a context, a task, and tools —
 * get a result back. The tool-calling loop lives inside.
 *
 * Usage:
 *   import * as Dispatch from "@theseus.run/core/Dispatch"
 *
 *   const handle = Dispatch.dispatch(blueprint, task)
 *   const result = Dispatch.dispatchAwait(blueprint, task)
 */

// ---------------------------------------------------------------------------
// Functions (already clean — no prefix to drop)
// ---------------------------------------------------------------------------

export {
  dispatch,
  dispatchAwait,
  runToolCall,
  step,
  tryParseArgs,
} from "./dispatch/index.ts";

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Dispatch.*`)
// ---------------------------------------------------------------------------

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
} from "./dispatch/index.ts";

// ---------------------------------------------------------------------------
// Log (audit / replay / restore)
// ---------------------------------------------------------------------------

export type {
  DispatchSummary,
  EventEntry,
  Snapshot,
} from "./dispatch/index.ts";
export {
  DispatchDefaults,
  DispatchLog,
  InMemoryDispatchLog,
  NoopDispatchLog,
} from "./dispatch/index.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix — _tag must be globally unique)
// ---------------------------------------------------------------------------

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
} from "./dispatch/index.ts";
