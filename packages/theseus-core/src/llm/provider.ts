/**
 * LLMProvider — the interface between Theseus and any language model.
 *
 * Provider-agnostic. Copilot, OpenAI, Anthropic, Ollama — all implement this.
 * Nothing in the runtime imports a concrete provider directly.
 *
 * Message roles follow the standard conversation model:
 *   system    → sets agent persona and constraints
 *   user      → human turn
 *   assistant → model turn (may include tool calls)
 *   tool      → result of a tool call, keyed by toolCallId
 */

import { Data, Effect, ServiceMap } from "effect";

// ---------------------------------------------------------------------------
// Tool call — what the model emits when it wants to invoke a tool
// ---------------------------------------------------------------------------

export interface LLMToolCall {
  /** Unique call ID — correlates assistant tool_calls with tool results. */
  readonly id: string;
  /** Tool name as registered in the tool list. */
  readonly name: string;
  /** Raw JSON string of arguments — the model serialises these. */
  readonly arguments: string;
}

// ---------------------------------------------------------------------------
// Messages — the conversation history
// ---------------------------------------------------------------------------

export type LLMMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string; // empty string when model only emitted tool calls
      readonly toolCalls?: ReadonlyArray<LLMToolCall>;
    }
  | {
      readonly role: "tool";
      readonly toolCallId: string; // must match LLMToolCall.id
      readonly content: string; // serialised tool result
    };

// ---------------------------------------------------------------------------
// Tool definition — what the model sees (derived from Tool<I,O>)
// ---------------------------------------------------------------------------

export interface LLMToolDef {
  readonly name: string;
  readonly description: string;
  /** JSON Schema describing the input. Passed directly to the model. */
  readonly inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Usage — token counts returned with every response
// ---------------------------------------------------------------------------

export interface LLMUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

// ---------------------------------------------------------------------------
// Response — discriminated: the model either finished or wants tools
// ---------------------------------------------------------------------------

export type LLMResponse =
  | { readonly type: "text"; readonly content: string; readonly thinking?: string; readonly usage: LLMUsage }
  | { readonly type: "tool_calls"; readonly toolCalls: ReadonlyArray<LLMToolCall>; readonly thinking?: string; readonly usage: LLMUsage };

// ---------------------------------------------------------------------------
// Call options — overrides provider-level defaults per call
// ---------------------------------------------------------------------------

export interface LLMCallOptions {
  readonly model?: string;
  readonly maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Permanent LLM failure — bad credentials, malformed request, parse error. */
export class LLMError extends Data.TaggedError("LLMError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Transient LLM failure — rate limit, server error. Runtime may retry. */
export class LLMErrorRetriable extends Data.TaggedError("LLMErrorRetriable")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// ---------------------------------------------------------------------------
// LLMProvider service
// ---------------------------------------------------------------------------

export class LLMProvider extends ServiceMap.Service<
  LLMProvider,
  {
    /**
     * Call the model with a conversation history and available tools.
     * Returns text when the model is done, or tool_calls when it wants to act.
     */
    readonly call: (
      messages: ReadonlyArray<LLMMessage>,
      tools: ReadonlyArray<LLMToolDef>,
      options?: LLMCallOptions,
    ) => Effect.Effect<LLMResponse, LLMError | LLMErrorRetriable>;
  }
>()("LLMProvider") {}
