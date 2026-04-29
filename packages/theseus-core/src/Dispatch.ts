/**
 * Dispatch — namespace barrel for `import * as Dispatch from "@theseus.run/core/Dispatch"`
 *
 * Raw LLM/tool loop. Give it a DispatchSpec, a task, and tools; it calls the
 * model, executes requested tools, and returns final assistant content when the
 * model stops requesting tools.
 *
 * Usage:
 *   import * as Dispatch from "@theseus.run/core/Dispatch"
 *
 *   const spec: Dispatch.DispatchSpec = { name, systemPrompt, tools }
 *   const handle = Dispatch.dispatch(spec, task)
 *   const result = Dispatch.dispatchAwait(spec, task)
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
  CopilotModelRequest,
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
  DispatchControlGate,
  DispatchControlState,
  DispatchCreate,
  DispatchError,
  DispatchEvent,
  DispatchEventEntry,
  DispatchHandle,
  DispatchId,
  DispatchOptions,
  DispatchOutput,
  DispatchRecord,
  DispatchSnapshot,
  DispatchSpec,
  DispatchSummary,
  Injection,
  ModelRequest,
  OpenAIModelRequest,
  StepResult,
  ToolCall,
  ToolCallError,
  ToolCallResult,
  Usage,
} from "./dispatch/index.ts";
export {
  Cortex,
  CortexDiffs,
  CortexSignals,
  CortexStack,
  CurrentDispatch,
  DispatchDefaults,
  DispatchStore,
  InMemoryDispatchStore,
  LanguageModelGateway,
  LanguageModelGatewayFromLanguageModel,
  ModelUnavailable,
  makeDispatchControlGate,
  makeDispatchId,
  NoopCortex,
  NoopDispatchControlGate,
} from "./dispatch/index.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix — _tag must be globally unique)
// ---------------------------------------------------------------------------

export {
  DispatchCycleExceeded,
  DispatchInterrupted,
  DispatchModelFailed,
  DispatchOutputSchema,
  DispatchStoreDecodeFailed,
  DispatchToolFailed,
  ToolCallBadArgs,
  ToolCallFailed,
  ToolCallUnknown,
  UsageSchema,
} from "./dispatch/index.ts";
