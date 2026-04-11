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
  stepStream,
  tryParseArgs,
} from "./dispatch/index.ts";

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Dispatch.*`)
// ---------------------------------------------------------------------------

export type {
  DispatchEvent as Event,
  DispatchHandle as Handle,
  DispatchOptions as Options,
  Injection,
  StepResult,
  StepText,
  StepToolCalls,
  StreamDelta,
  ToolCall,
  ToolCallError,
  ToolCallResult,
  Usage,
} from "./dispatch/index.ts";

// ---------------------------------------------------------------------------
// Log (audit / replay / restore)
// ---------------------------------------------------------------------------

export {
  DispatchLog as Log,
  InMemoryDispatchLog as InMemoryLog,
  NoopDispatchLog as NoopLog,
} from "./dispatch/index.ts";

export type {
  EventEntry,
  Snapshot,
} from "./dispatch/index.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix — _tag must be globally unique)
// ---------------------------------------------------------------------------

export { ToolCallBadArgs, ToolCallFailed, ToolCallUnknown } from "./dispatch/index.ts";
