/**
 * Step — one LLM call via LanguageModel. Pure — no tool execution, no loop.
 *
 *   stepStream(messages, tools, agentName, onChunk)
 *     → StepText      { _tag: "text", content, usage }
 *     → StepToolCalls  { _tag: "tool_calls", toolCalls, usage }
 *
 * Tool execution is the caller's responsibility. This keeps step() pure
 * and gives callers control over intermediate steps (event emission,
 * interrupt checks) between receiving tool_calls and executing them.
 *
 * Uses LanguageModel from effect/unstable/ai with disableToolCallResolution: true
 * so that our dispatch loop retains full control over tool execution.
 */

import { Effect, Match, Schedule, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as Prompt from "effect/unstable/ai/Prompt";
import type * as Response from "effect/unstable/ai/Response";
import * as AiError from "effect/unstable/ai/AiError";
import { AgentError } from "../agent/index.ts";
import type { ToolAny } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";
import { llmMessagesToPrompt } from "../bridge/to-prompt.ts";
import { theseusToolsToToolkit } from "../bridge/to-ai-tools.ts";
import type { Message, StepResult, ToolCall, ToolCallResult, Usage } from "./types.ts";

// ---------------------------------------------------------------------------
// responsePartsToStepResult — extract text/toolCalls/thinking/usage from parts
// ---------------------------------------------------------------------------

const extractUsage = (parts: ReadonlyArray<Response.PartEncoded>): Usage =>
  parts.reduce<Usage>(
    (acc, part) =>
      part.type === "finish"
        ? {
            inputTokens: (part as any).usage?.inputTokens?.total ?? acc.inputTokens,
            outputTokens: (part as any).usage?.outputTokens?.total ?? acc.outputTokens,
          }
        : acc,
    { inputTokens: 0, outputTokens: 0 },
  );

const responsePartsToStepResult = (parts: ReadonlyArray<Response.PartEncoded>): StepResult => {
  const text = parts
    .filter((p): p is Response.TextPartEncoded => p.type === "text")
    .map((p) => p.text)
    .join("");

  const thinking = parts
    .filter((p) => p.type === "reasoning")
    .map((p) => (p as { text: string }).text)
    .join("");

  const toolCalls: ToolCall[] = parts
    .filter((p): p is Response.ToolCallPartEncoded => p.type === "tool-call")
    .map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: JSON.stringify(tc.params),
    }));

  const usage = extractUsage(parts);

  return toolCalls.length > 0
    ? { _tag: "tool_calls", toolCalls, ...(thinking ? { thinking } : {}), usage }
    : { _tag: "text", content: text, ...(thinking ? { thinking } : {}), usage };
};

// ---------------------------------------------------------------------------
// mapAiError — convert AiError to AgentError
// ---------------------------------------------------------------------------

const mapAiErrors = (agentName: string) => <A>(
  effect: Effect.Effect<A, AiError.AiError>,
): Effect.Effect<A, AgentError> =>
  effect.pipe(
    Effect.catchTag("AiError", (e) =>
      Effect.fail(new AgentError({ agent: agentName, message: `${e.module}.${e.method}: ${e.reason._tag}`, cause: e })),
    ),
  );

// ---------------------------------------------------------------------------
// tryParseArgs — best-effort JSON parse for event emission
// ---------------------------------------------------------------------------

export const tryParseArgs = (tc: ToolCall): unknown => {
  try { return JSON.parse(tc.arguments); }
  catch { return tc.arguments; }
};

// ---------------------------------------------------------------------------
// runToolCall — execute a single tool call.
// Errors become error strings (never propagates failure).
// ---------------------------------------------------------------------------

export const runToolCall = (
  tools: ReadonlyArray<ToolAny>,
  tc: ToolCall,
): Effect.Effect<ToolCallResult, never> => {
  const tool = tools.find((t) => t.name === tc.name);
  if (!tool)
    return Effect.succeed({
      callId: tc.id,
      name: tc.name,
      args: tryParseArgs(tc),
      content: `Error: unknown tool "${tc.name}"`,
    });

  const parsed = tryParseArgs(tc);
  const raw = typeof parsed === "string" ? undefined : parsed;
  if (raw === undefined)
    return Effect.succeed({
      callId: tc.id,
      name: tc.name,
      args: tc.arguments,
      content: "Error: invalid JSON in tool arguments",
    });

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
  toolCalls: ReadonlyArray<ToolCall>,
): Effect.Effect<ReadonlyArray<ToolCallResult>, never> =>
  Effect.all(
    toolCalls.map((tc) => runToolCall(tools, tc)),
    { concurrency: "unbounded" },
  );

// ---------------------------------------------------------------------------
// stepStream — streaming LLM call via LanguageModel
// ---------------------------------------------------------------------------

/** Chunk types we forward to the dispatch loop. */
export type StreamDelta =
  | { readonly type: "text-delta"; readonly delta: string }
  | { readonly type: "reasoning-delta"; readonly delta: string };

/**
 * Streaming LLM call via LanguageModel.streamText with disableToolCallResolution.
 *
 * Emits text/thinking deltas via onChunk callback. Returns StepResult when done.
 * Falls back to non-streaming generateText if streaming yields no result.
 */
export const stepStream = (
  messages: ReadonlyArray<Message>,
  tools: ReadonlyArray<ToolAny>,
  agentName: string,
  onChunk: (chunk: StreamDelta) => Effect.Effect<void>,
): Effect.Effect<StepResult, AgentError, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const prompt = llmMessagesToPrompt(messages);
    const toolkit = theseusToolsToToolkit(tools);

    // Collect all parts from the stream
    const allParts: Response.StreamPartEncoded[] = [];

    yield* LanguageModel.streamText({
      prompt,
      toolkit,
      disableToolCallResolution: true,
    }).pipe(
      Stream.tap((part) => {
        allParts.push(part as any);
        return Match.value(part.type).pipe(
          Match.when("text-delta", () =>
            onChunk({ type: "text-delta", delta: (part as any).delta }),
          ),
          Match.when("reasoning-delta", () =>
            onChunk({ type: "reasoning-delta", delta: (part as any).delta }),
          ),
          Match.orElse(() => Effect.void),
        );
      }),
      Stream.runDrain,
      mapAiErrors(agentName),
    );

    return responsePartsToStepResult(allParts as any);
  });

// ---------------------------------------------------------------------------
// step — non-streaming LLM call via LanguageModel.generateText
// ---------------------------------------------------------------------------

export const step = (
  messages: ReadonlyArray<Message>,
  tools: ReadonlyArray<ToolAny>,
  agentName: string,
): Effect.Effect<StepResult, AgentError, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const prompt = llmMessagesToPrompt(messages);
    const toolkit = theseusToolsToToolkit(tools);

    const response = yield* LanguageModel.generateText({
      prompt,
      toolkit,
      disableToolCallResolution: true,
    }).pipe(mapAiErrors(agentName));

    return responsePartsToStepResult(response.content.map((p) => {
      // Convert decoded Part to PartEncoded-like shape for our reducer
      if (p.type === "text") return { type: "text" as const, text: (p as any).text };
      if (p.type === "reasoning") return { type: "reasoning" as const, text: (p as any).text };
      if (p.type === "tool-call") return { type: "tool-call" as const, id: (p as any).id, name: (p as any).name, params: (p as any).params };
      if (p.type === "finish") return p as any;
      return p as any;
    }));
  });
