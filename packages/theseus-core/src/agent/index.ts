/**
 * Agent primitives — shared types for all agent strategies.
 *
 * Blueprint: agent config as data (name + systemPrompt + tools).
 * AgentResult: typed return from any agent dispatch.
 * AgentError: unified failure type.
 *
 * These are reused by both stateless and persistent agents.
 */

import { Data } from "effect";
import type { LLMUsage } from "../llm/provider.ts";
import type { ToolAny } from "../tool/index.ts";

// ---------------------------------------------------------------------------
// Blueprint — agent config as data
// ---------------------------------------------------------------------------

/** Agent configuration as data. Built at dispatch time. No hardcoded agent classes. */
export interface Blueprint {
  /** Agent name — used in errors and logging. */
  readonly name: string;
  /** System prompt — sets agent persona and constraints. */
  readonly systemPrompt: string;
  /** Tools available to this agent. */
  readonly tools: ReadonlyArray<ToolAny>;
  /** Max LLM→tool→LLM iterations before AgentError. Default: 20. */
  readonly maxIterations?: number;
}

// ---------------------------------------------------------------------------
// AgentResult — typed return from any agent dispatch
// ---------------------------------------------------------------------------

/** Typed result returned when an agent finishes its task. */
export interface AgentResult {
  /** Final text content from the agent. */
  readonly content: string;
  /** Token usage accumulated across all LLM calls in the loop. */
  readonly usage: LLMUsage;
}

// ---------------------------------------------------------------------------
// AgentError — unified failure type
// ---------------------------------------------------------------------------

/** Agent failure — permanent. Mirrors ToolError.tool with AgentError.agent. */
export class AgentError extends Data.TaggedError("AgentError")<{
  /** Blueprint name — which agent failed. */
  readonly agent: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}
