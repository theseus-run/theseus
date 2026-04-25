/**
 * Agent primitives — shared types for all agent strategies.
 *
 * Blueprint: agent config as data (name + systemPrompt + tools).
 * AgentResult: typed return from agent/grunt protocols.
 * AgentError: union of agent protocol failures (AgentInterrupted | AgentCycleExceeded | AgentLLMError).
 */

import { Data } from "effect";
import type { Usage } from "../dispatch/types.ts";
import type { ToolAnyWith } from "../tool/index.ts";

export {
  BlueprintNotFound,
  BlueprintRegistry,
  BlueprintRegistryLive,
  type BlueprintSummary,
} from "./blueprint-registry.ts";
export { AgentIdentity, AgentIdentityLive } from "./identity.ts";

// ---------------------------------------------------------------------------
// ResultKind — routing signal for orchestrator / code consumers
// ---------------------------------------------------------------------------

export type ResultKind = "success" | "error" | "defect" | "unstructured";

// ---------------------------------------------------------------------------
// Blueprint — agent config as data
// ---------------------------------------------------------------------------

export interface Blueprint<R = never> {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<ToolAnyWith<R>>;
  readonly maxIterations?: number;
  readonly model?: string;
}

// ---------------------------------------------------------------------------
// AgentResult — typed return from agent/grunt protocols
// ---------------------------------------------------------------------------

export interface AgentResult {
  /** Routing signal: success (deliverable), error (actionable), defect (broken), unstructured (no report tool used). */
  readonly result: ResultKind;
  /** One-line summary. Empty for unstructured results. */
  readonly summary: string;
  /** Full deliverable, error description, or raw text. */
  readonly content: string;
  /** Token usage accumulated across all LLM calls in the loop. */
  readonly usage: Usage;
}

// ---------------------------------------------------------------------------
// AgentError — union of agent protocol failure types
// ---------------------------------------------------------------------------

/** Agent protocol was interrupted (via injection or fiber interrupt). */
export class AgentInterrupted extends Data.TaggedError("AgentInterrupted")<{
  readonly agent: string;
  readonly reason?: string;
}> {}

/** Agent protocol exceeded its iteration cap. */
export class AgentCycleExceeded extends Data.TaggedError("AgentCycleExceeded")<{
  readonly agent: string;
  readonly max: number;
  readonly usage: Usage;
}> {}

/** Underlying dispatch model call failed. */
export class AgentLLMError extends Data.TaggedError("AgentLLMError")<{
  readonly agent: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Union of all agent protocol errors. */
export type AgentError = AgentInterrupted | AgentCycleExceeded | AgentLLMError;
