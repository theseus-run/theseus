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
import * as Prompt from "effect/unstable/ai/Prompt";
import type * as Response from "effect/unstable/ai/Response";
import * as AiError from "effect/unstable/ai/AiError";
import { AgentLLMError } from "../agent/index.ts";
import type { AgentError } from "../agent/index.ts";
import type { ToolAny } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";
import { theseusToolsToToolkit } from "../bridge/to-ai-tools.ts";
import { ToolCallUnknown, ToolCallBadArgs, ToolCallFailed } from "./types.ts";
import type { StepResult, ToolCall, ToolCallError, ToolCallResult, Usage } from "./types.ts";

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
      Effect.fail(new AgentLLMError({ agent: agentName, message: `${e.module}.${e.method}: ${e.reason._tag}`, cause: e })),
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
// Fails with typed ToolCallError — caller decides how to handle.
// ---------------------------------------------------------------------------

export const runToolCall = (
  tools: ReadonlyArray<ToolAny>,
  tc: ToolCall,
): Effect.Effect<ToolCallResult, ToolCallError> => {
  const tool = tools.find((t) => t.name === tc.name);
  if (!tool)
    return Effect.fail(new ToolCallUnknown({ callId: tc.id, name: tc.name }));

  const parsed = tryParseArgs(tc);
  const raw = typeof parsed === "string" ? undefined : parsed;
  if (raw === undefined)
    return Effect.fail(new ToolCallBadArgs({ callId: tc.id, name: tc.name, raw: tc.arguments }));

  return callTool(tool, raw).pipe(
    Effect.map((r) => ({
      callId: tc.id,
      name: tc.name,
      args: raw,
      content: r.llmContent,
    })),
    Effect.mapError((cause) => new ToolCallFailed({ callId: tc.id, name: tc.name, args: raw, cause })),
  );
};

// ---------------------------------------------------------------------------
// foldStreamParts — fold StreamPartEncoded[] into PartEncoded[]
// ---------------------------------------------------------------------------

/** Fold streaming deltas (text-start/text-delta/text-end) back into complete parts. */
const foldStreamParts = (streamParts: ReadonlyArray<Response.StreamPartEncoded>): Response.PartEncoded[] => {
  const acc = streamParts.reduce(
    (state, part) =>
      Match.value(part.type).pipe(
        Match.when("text-delta", () => ({ ...state, text: state.text + (part as any).delta })),
        Match.when("reasoning-delta", () => ({ ...state, reasoning: state.reasoning + (part as any).delta })),
        Match.when("tool-call", () => ({ ...state, parts: [...state.parts, part as Response.PartEncoded] })),
        Match.when("finish", () => ({ ...state, parts: [...state.parts, part as Response.PartEncoded] })),
        Match.when("error", () => ({ ...state, parts: [...state.parts, part as Response.PartEncoded] })),
        Match.orElse(() => state),
      ),
    { text: "", reasoning: "", parts: [] as Response.PartEncoded[] },
  );

  return [
    ...(acc.reasoning ? [{ type: "reasoning", text: acc.reasoning } as any] : []),
    ...(acc.text ? [{ type: "text", text: acc.text } as Response.TextPartEncoded] : []),
    ...acc.parts,
  ];
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
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  tools: ReadonlyArray<ToolAny>,
  agentName: string,
  onChunk: (chunk: StreamDelta) => Effect.Effect<void>,
): Effect.Effect<StepResult, AgentError, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const prompt = Prompt.make(messages);
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
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  tools: ReadonlyArray<ToolAny>,
  agentName: string,
): Effect.Effect<StepResult, AgentError, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const prompt = Prompt.make(messages);
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
