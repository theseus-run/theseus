/**
 * Agent primitives — shared types for all agent strategies.
 *
 * Blueprint: agent config as data (name + systemPrompt + tools).
 * AgentResult: typed return from any agent dispatch.
 * AgentError: unified failure type.
 */

import { Data } from "effect";
import type { Usage } from "../dispatch/types.ts";
import type { ToolAny } from "../tool/index.ts";

// ---------------------------------------------------------------------------
// ResultKind — routing signal for orchestrator / code consumers
// ---------------------------------------------------------------------------

export type ResultKind = "success" | "error" | "defect" | "unstructured";

// ---------------------------------------------------------------------------
// Blueprint — agent config as data
// ---------------------------------------------------------------------------

export interface Blueprint {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<ToolAny>;
  readonly maxIterations?: number;
}

// ---------------------------------------------------------------------------
// AgentResult — typed return from any agent dispatch
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
// AgentError — unified failure type
// ---------------------------------------------------------------------------

export class AgentError extends Data.TaggedError("AgentError")<{
  readonly agent: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
