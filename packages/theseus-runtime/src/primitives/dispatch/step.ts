/**
 * Step — one LLM round: call + tool execution.
 *
 * Pure — no fiber, no events, no loop. Caller decides what to do with the result.
 *
 *   step(messages, tools, agentName)
 *     → StepText   { _tag: "text", content, usage }
 *     → StepToolCalls { _tag: "tool_calls", messages, usage, calls }
 *
 * Exported helpers:
 *   extractToolDefs — Tool[] → LLMToolDef[]
 *   runToolCall     — execute a single tool call (errors become strings)
 *   runToolCalls    — execute all tool calls in parallel
 */

import { Effect, Schedule } from "effect";
import { AgentError } from "../agent/index.ts";
import type { LLMMessage, LLMToolCall, LLMToolDef, LLMUsage } from "../llm/provider.ts";
import { LLMErrorRetriable, LLMProvider } from "../llm/provider.ts";
import type { ToolAny } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";
import type { StepResult, ToolCallResult } from "./types.ts";

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
// tryParseArgs — best-effort JSON parse for event emission
// ---------------------------------------------------------------------------

const tryParseArgs = (tc: LLMToolCall): unknown => {
  try {
    return JSON.parse(tc.arguments);
  } catch {
    return tc.arguments;
  }
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

  let raw: unknown;
  try {
    raw = JSON.parse(tc.arguments);
  } catch {
    return Effect.succeed({
      callId: tc.id,
      name: tc.name,
      args: tc.arguments,
      content: "Error: invalid JSON in tool arguments",
    });
  }

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
// addUsage — accumulate token counts
// ---------------------------------------------------------------------------

const addUsage = (a: LLMUsage, b: LLMUsage): LLMUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

// ---------------------------------------------------------------------------
// step — one LLM round
// ---------------------------------------------------------------------------

/**
 * One LLM round: call LLM with retry → if text return, if tool_calls execute → return.
 * Pure — no events, no fiber, no loop. Caller decides what to do with the result.
 *
 * @param messages - conversation so far
 * @param tools - available tools
 * @param agentName - for error attribution
 * @param usage - accumulated usage from prior steps (added to response usage)
 * @param retrySchedule - override default retry for LLMErrorRetriable
 */
export const step = (
  messages: ReadonlyArray<LLMMessage>,
  tools: ReadonlyArray<ToolAny>,
  agentName: string,
  usage: LLMUsage = { inputTokens: 0, outputTokens: 0 },
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
      Effect.catchTag("LLMErrorRetriable", (e) =>
        Effect.fail(
          new AgentError({ agent: agentName, message: e.message, cause: e }),
        ),
      ),
      Effect.catchTag("LLMError", (e) =>
        Effect.fail(
          new AgentError({ agent: agentName, message: e.message, cause: e }),
        ),
      ),
    );

    const totalUsage = addUsage(usage, response.usage);

    if (response.type === "text") {
      return { _tag: "text" as const, content: response.content, usage: totalUsage };
    }

    // Execute all tool calls in parallel
    const calls = yield* runToolCalls(tools, response.toolCalls);

    const toolMessages: ReadonlyArray<LLMMessage> = calls.map((r) => ({
      role: "tool" as const,
      toolCallId: r.callId,
      content: r.content,
    }));

    return {
      _tag: "tool_calls" as const,
      messages: [
        ...messages,
        { role: "assistant" as const, content: "", toolCalls: response.toolCalls },
        ...toolMessages,
      ],
      usage: totalUsage,
      calls,
    };
  });
