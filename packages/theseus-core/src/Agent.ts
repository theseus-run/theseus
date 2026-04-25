/**
 * Agent — namespace barrel for `import * as Agent from "@theseus.run/core/Agent"`
 *
 * Protocol-level types above raw dispatch. Blueprint is agent/grunt
 * config-as-data; AgentResult is the semantic return from agent/grunt
 * protocols.
 *
 * Usage:
 *   import * as Agent from "@theseus.run/core/Agent"
 *
 *   const bp: Agent.Blueprint = { name: "explorer", systemPrompt: "...", tools: [...] }
 *   const result: Agent.AgentResult = yield* Grunt.dispatchAwait(bp, task)
 */

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Agent.*`)
// ---------------------------------------------------------------------------

export type { AgentError, AgentResult, Blueprint, ResultKind } from "./agent/index.ts";
export {
  AgentIdentity,
  AgentIdentityLive,
  BlueprintNotFound,
  BlueprintRegistry,
  BlueprintRegistryLive,
  type BlueprintSummary,
} from "./agent/index.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix — _tag must be globally unique)
// ---------------------------------------------------------------------------

export {
  AgentCycleExceeded,
  AgentInterrupted,
  AgentLLMError,
  AgentToolFailed,
} from "./agent/index.ts";
