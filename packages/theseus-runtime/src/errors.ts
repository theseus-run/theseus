/**
 * Domain errors for the Theseus runtime.
 *
 * All errors extend Data.TaggedError so they:
 *   - carry a discriminant `_tag` for exhaustive pattern matching
 *   - are structurally equal (Data.Equal)
 *   - render readable messages via .message / Cause.pretty
 */
import { Data } from "effect";

// ---------------------------------------------------------------------------
// TypeScript Language Service
// ---------------------------------------------------------------------------

export class TsServiceInitError extends Data.TaggedError("TsServiceInitError")<{
  readonly cause: unknown;
}> {
  override get message() {
    return `TypeScript service failed to initialize: ${String(this.cause)}`;
  }
}

// ---------------------------------------------------------------------------
// Copilot / LLM
// ---------------------------------------------------------------------------

export class CopilotTokenError extends Data.TaggedError("CopilotTokenError")<{
  readonly cause: unknown;
}> {
  override get message() {
    return `Copilot token exchange failed: ${String(this.cause)}`;
  }
}

export class LLMHttpError extends Data.TaggedError("LLMHttpError")<{
  readonly status: number;
  readonly body: string;
}> {
  override get message() {
    return `Copilot API error ${this.status}: ${this.body}`;
  }
}

export class LLMParseError extends Data.TaggedError("LLMParseError")<{
  readonly cause: unknown;
}> {
  override get message() {
    return `Failed to parse Copilot response: ${String(this.cause)}`;
  }
}

// ---------------------------------------------------------------------------
// Agent system
// ---------------------------------------------------------------------------

// AgentNotFoundError removed — registry.send returns boolean on miss,
// never throws. Reserved for future use if the registry grows a typed send.
