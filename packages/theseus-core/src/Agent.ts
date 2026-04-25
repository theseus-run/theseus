/**
 * Agent — namespace barrel for `import * as Agent from "@theseus.run/core/Agent"`
 *
 * Shared types for all agent strategies. Blueprint is config-as-data.
 * AgentResult is the typed return from any dispatch.
 *
 * Usage:
 *   import * as Agent from "@theseus.run/core/Agent"
 *
 *   const bp: Agent.Blueprint = { name: "explorer", systemPrompt: "...", tools: [...] }
 *   const result: Agent.Result = yield* Grunt.gruntAwait(bp, task)
 */

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Agent.*`)
// ---------------------------------------------------------------------------

export type { AgentError, AgentResult as Result, Blueprint, ResultKind } from "./agent/index.ts";
export { AgentIdentity as Identity, AgentIdentityLive as IdentityLive } from "./agent/index.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix — _tag must be globally unique)
// ---------------------------------------------------------------------------

export { AgentCycleExceeded, AgentInterrupted, AgentLLMError } from "./agent/index.ts";
