/**
 * Step — one LLM call. Pure — no tool execution, no fiber, no events, no loop.
 *
 *   step(messages, tools, agentName)
 *     → StepText      { _tag: "text", content, usage }
 *     → StepToolCalls  { _tag: "tool_calls", toolCalls, usage }
 *
 * Tool execution is the caller's responsibility. This keeps step() pure
 * and gives callers control over intermediate steps (event emission,
 * interrupt checks) between receiving tool_calls and executing them.
 *
 * Exported helpers:
 *   extractToolDefs — Tool[] → LLMToolDef[]
 *   runToolCall     — execute a single tool call (errors become strings)
 *   runToolCalls    — execute all tool calls in parallel
 */

import { Effect, Match, Option, Schedule, Stream } from "effect";
import { AgentError } from "../agent/index.ts";
import type { LLMMessage, LLMResponse, LLMStreamChunk, LLMToolCall, LLMToolDef } from "../llm/provider.ts";
import { LLMError, LLMErrorRetriable, LLMProvider } from "../llm/provider.ts";
import type { ToolAny } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";
import type { StepResult, ToolCallResult } from "./types.ts";

// ---------------------------------------------------------------------------
// responseToStepResult — map LLMResponse → StepResult (shared by step/stepStream)
// ---------------------------------------------------------------------------

const responseToStepResult = (r: LLMResponse): StepResult =>
  Match.value(r).pipe(
    Match.when({ type: "text" }, (r) => ({
      _tag: "text" as const,
      content: r.content,
      ...(r.thinking ? { thinking: r.thinking } : {}),
      usage: r.usage,
    })),
    Match.when({ type: "tool_calls" }, (r) => ({
      _tag: "tool_calls" as const,
      toolCalls: r.toolCalls,
      ...(r.thinking ? { thinking: r.thinking } : {}),
      usage: r.usage,
    })),
    Match.exhaustive,
  );

// ---------------------------------------------------------------------------
// mapLLMError — convert LLM errors to AgentError (shared by step/stepStream)
// ---------------------------------------------------------------------------

const mapLLMErrors = (agentName: string) => <A>(
  effect: Effect.Effect<A, LLMError | LLMErrorRetriable>,
): Effect.Effect<A, AgentError> =>
  effect.pipe(
    Effect.catchTag("LLMErrorRetriable", (e) =>
      Effect.fail(new AgentError({ agent: agentName, message: e.message, cause: e })),
    ),
    Effect.catchTag("LLMError", (e) =>
      Effect.fail(new AgentError({ agent: agentName, message: e.message, cause: e })),
    ),
  );

// ---------------------------------------------------------------------------
// Default LLM retry schedule — 3 retries, 500ms exponential jittered
// ---------------------------------------------------------------------------

export const DEFAULT_LLM_RETRY_SCHEDULE = Schedule.both(
  Schedule.exponential("500 millis").pipe(Schedule.jittered),
  Schedule.recurs(3),
);

// ---------------------------------------------------------------------------
// extractToolDefs — Tool[] → LLMToolDef[]
// ---------------------------------------------------------------------------

export const extractToolDefs = (
  tools: ReadonlyArray<ToolAny>,
): ReadonlyArray<LLMToolDef> =>
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

// ---------------------------------------------------------------------------
// tryParseJson — best-effort JSON parse, returns raw string on failure
// ---------------------------------------------------------------------------

const tryParseJson = (str: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } => {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch {
    return { ok: false };
  }
};

// ---------------------------------------------------------------------------
// tryParseArgs — best-effort JSON parse for event emission
// ---------------------------------------------------------------------------

export const tryParseArgs = (tc: LLMToolCall): unknown => {
  const result = tryParseJson(tc.arguments);
  return result.ok ? result.value : tc.arguments;
};

// ---------------------------------------------------------------------------
// runToolCall — execute a single tool call.
// Errors become error strings (never propagates failure).
// ---------------------------------------------------------------------------

export const runToolCall = (
  tools: ReadonlyArray<ToolAny>,
  tc: LLMToolCall,
): Effect.Effect<ToolCallResult, never> => {
  const tool = tools.find((t) => t.name === tc.name);
  if (!tool)
    return Effect.succeed({
      callId: tc.id,
      name: tc.name,
      args: tryParseArgs(tc),
      content: `Error: unknown tool "${tc.name}"`,
    });

  const parsed = tryParseJson(tc.arguments);
  if (!parsed.ok)
    return Effect.succeed({
      callId: tc.id,
      name: tc.name,
      args: tc.arguments,
      content: "Error: invalid JSON in tool arguments",
    });

  const raw = parsed.value;
  return callTool(tool, raw).pipe(
    Effect.map((r) => r.llmContent),
    Effect.catchTags({
      ToolError: (e) => Effect.succeed(`Error: ${e.message}`),
      ToolErrorInput: (e) => Effect.succeed(`Error: ${e.message}`),
      ToolErrorOutput: (e) => Effect.succeed(`Error: ${e.message}`),
    }),
    Effect.map((content) => ({
      callId: tc.id,
      name: tc.name,
      args: raw,
      content,
    })),
  );
};

// ---------------------------------------------------------------------------
// runToolCalls — execute all tool calls in parallel
// ---------------------------------------------------------------------------

export const runToolCalls = (
  tools: ReadonlyArray<ToolAny>,
  toolCalls: ReadonlyArray<LLMToolCall>,
): Effect.Effect<ReadonlyArray<ToolCallResult>, never> =>
  Effect.all(
    toolCalls.map((tc) => runToolCall(tools, tc)),
    { concurrency: "unbounded" },
  );

// ---------------------------------------------------------------------------
// step — one LLM call (pure, no tool execution)
// ---------------------------------------------------------------------------

/**
 * One LLM call: send messages + tool defs, retry retriable errors, return result.
 * Does NOT execute tools — returns raw toolCalls for the caller to handle.
 *
 * @param messages - conversation so far
 * @param tools - available tools (extracted to LLMToolDef for the call)
 * @param agentName - for error attribution
 * @param retrySchedule - override default retry for LLMErrorRetriable
 */
export const step = (
  messages: ReadonlyArray<LLMMessage>,
  tools: ReadonlyArray<ToolAny>,
  agentName: string,
  retrySchedule: Schedule.Schedule<unknown, unknown> = DEFAULT_LLM_RETRY_SCHEDULE,
): Effect.Effect<StepResult, AgentError, LLMProvider> =>
  Effect.gen(function* () {
    const toolDefs = extractToolDefs(tools);
    const llm = yield* LLMProvider;

    const response = yield* llm.call(messages, toolDefs).pipe(
      Effect.retry({
        while: (e): e is LLMErrorRetriable => e._tag === "LLMErrorRetriable",
        schedule: retrySchedule,
      }),
      mapLLMErrors(agentName),
    );

    return responseToStepResult(response);
  });

// ---------------------------------------------------------------------------
// stepStream — streaming LLM call, emits deltas via callback
// ---------------------------------------------------------------------------

/**
 * Streaming LLM call. Uses callStream if the provider supports it,
 * falls back to non-streaming step() otherwise.
 *
 * The onChunk callback is called for each text/thinking delta as it arrives.
 * Returns the same StepResult as step() once the stream completes.
 */
export const stepStream = (
  messages: ReadonlyArray<LLMMessage>,
  tools: ReadonlyArray<ToolAny>,
  agentName: string,
  onChunk: (chunk: LLMStreamChunk) => Effect.Effect<void>,
): Effect.Effect<StepResult, AgentError, LLMProvider> =>
  Effect.gen(function* () {
    const toolDefs = extractToolDefs(tools);
    const llm = yield* LLMProvider;

    // Fall back to non-streaming if provider doesn't support it
    if (!llm.callStream) {
      return yield* step(messages, tools, agentName);
    }

    const lastChunk = yield* llm.callStream(messages, toolDefs).pipe(
      Stream.tap((chunk) => onChunk(chunk)),
      Stream.runLast,
      mapLLMErrors(agentName),
    );

    // The last chunk must be a "done" with the full response
    if (Option.isNone(lastChunk) || lastChunk.value.type !== "done") {
      return yield* Effect.fail(
        new AgentError({ agent: agentName, message: "Stream ended without done chunk" }),
      );
    }

    return responseToStepResult(lastChunk.value.response);
  });
