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

import { Effect, Match, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
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

const mapAiErrors = <A, R>(
  agentName: string,
  effect: Effect.Effect<A, AiError.AiError, R>,
): Effect.Effect<A, AgentError, R> =>
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
// foldStreamParts — fold StreamPartEncoded[] into PartEncoded[]
// ---------------------------------------------------------------------------

/** Fold streaming deltas (text-start/text-delta/text-end) back into complete parts. */
const foldStreamParts = (streamParts: ReadonlyArray<Response.StreamPartEncoded>): Response.PartEncoded[] => {
  let text = "";
  let reasoning = "";
  const parts: Response.PartEncoded[] = [];

  streamParts.forEach((part) =>
    Match.value(part.type).pipe(
      Match.when("text-delta", () => { text += (part as any).delta; }),
      Match.when("reasoning-delta", () => { reasoning += (part as any).delta; }),
      Match.when("tool-call", () => { parts.push(part as any); }),
      Match.when("finish", () => { parts.push(part as any); }),
      Match.when("error", () => { parts.push(part as any); }),
      Match.orElse(() => {}), // text-start, text-end, etc. — no-op
    ),
  );

  if (text) parts.unshift({ type: "text", text } as Response.TextPartEncoded);
  if (reasoning) parts.unshift({ type: "reasoning", text: reasoning } as any);

  return parts;
};

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

    yield* mapAiErrors(
      agentName,
      LanguageModel.streamText({
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
      ),
    );

    return responsePartsToStepResult(foldStreamParts(allParts));
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

    const response = yield* mapAiErrors(
      agentName,
      LanguageModel.generateText({
        prompt,
        toolkit,
        disableToolCallResolution: true,
      }),
    );

    return responsePartsToStepResult(response.content.map((p: any) =>
      Match.value(p.type).pipe(
        Match.when("text", () => ({ type: "text" as const, text: p.text })),
        Match.when("reasoning", () => ({ type: "reasoning" as const, text: p.text })),
        Match.when("tool-call", () => ({ type: "tool-call" as const, id: p.id, name: p.name, params: p.params })),
        Match.when("finish", () => p),
        Match.orElse(() => p),
      ),
    ));
  });
