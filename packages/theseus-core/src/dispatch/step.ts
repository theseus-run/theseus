/**
 * Step — one LLM call via LanguageModel. Pure — no tool execution, no loop.
 *
 *   stepStream(messages, tools, dispatchId, agentName, onChunk)
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
import type * as AiError from "effect/unstable/ai/AiError";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as Prompt from "effect/unstable/ai/Prompt";
import type * as Response from "effect/unstable/ai/Response";
import { toolsArrayToAiToolkit } from "../bridge/to-ai-tools.ts";
import type { Content, Presentation, ToolAnyWith } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";
import type { StepResult, ToolCall, ToolCallError, ToolCallResult, Usage } from "./types.ts";
import { DispatchModelFailed, ToolCallBadArgs, ToolCallFailed, ToolCallUnknown } from "./types.ts";

// ---------------------------------------------------------------------------
// responsePartsToStepResult — extract text/toolCalls/thinking/usage from parts
// ---------------------------------------------------------------------------

const extractUsage = (parts: ReadonlyArray<Response.PartEncoded>): Usage =>
  parts.reduce<Usage>(
    (acc, part) => {
      const finish = part as Response.FinishPartEncoded & {
        readonly usage?: {
          readonly inputTokens?: { readonly total?: number };
          readonly outputTokens?: { readonly total?: number };
        };
      };
      return part.type === "finish"
        ? {
            inputTokens: finish.usage?.inputTokens?.total ?? acc.inputTokens,
            outputTokens: finish.usage?.outputTokens?.total ?? acc.outputTokens,
          }
        : acc;
    },
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
// mapAiError — convert AiError to DispatchError
// ---------------------------------------------------------------------------

const mapAiErrors = <A, R>(
  dispatchId: string,
  agentName: string,
  effect: Effect.Effect<A, AiError.AiError, R>,
): Effect.Effect<A, DispatchModelFailed, R> =>
  effect.pipe(
    Effect.catchTag("AiError", (e) =>
      Effect.fail(
        new DispatchModelFailed({
          dispatchId,
          agent: agentName,
          message: `${e.module}.${e.method}: ${e.reason._tag}`,
          cause: e,
        }),
      ),
    ),
  );

// ---------------------------------------------------------------------------
// tryParseArgs — best-effort JSON parse for event emission
// ---------------------------------------------------------------------------

export const tryParseArgs = (tc: ToolCall): unknown => {
  try {
    return JSON.parse(tc.arguments);
  } catch {
    return tc.arguments;
  }
};

// ---------------------------------------------------------------------------
// presentationToText — extract a text-only view of a Presentation.
// Non-text content is summarized so UI events always have a stringy preview.
// ---------------------------------------------------------------------------

const contentToText = (c: Content): string => {
  switch (c._tag) {
    case "text":
      return c.text;
    case "image":
      return `[image:${c.mime}]`;
    case "audio":
      return `[audio:${c.mime}]`;
    case "resource":
      return c.text ?? `[resource:${c.uri}]`;
  }
};

export const presentationToText = (p: Presentation): string =>
  p.content.map(contentToText).join("");

// ---------------------------------------------------------------------------
// runToolCall — execute a single tool call.
// Fails with typed ToolCallError — caller decides how to handle.
// Tool-author failures (F) are folded into the Presentation's isError flag.
// ---------------------------------------------------------------------------

export const runToolCall = <R = never>(
  tools: ReadonlyArray<ToolAnyWith<R>>,
  tc: ToolCall,
): Effect.Effect<ToolCallResult, ToolCallError, R> => {
  const tool = tools.find((t) => t.name === tc.name);
  if (!tool) return Effect.fail(new ToolCallUnknown({ callId: tc.id, name: tc.name }));

  const parsed = tryParseArgs(tc);
  if (typeof parsed !== "object" || parsed === null)
    return Effect.fail(new ToolCallBadArgs({ callId: tc.id, name: tc.name, raw: tc.arguments }));

  return callTool(tool, parsed).pipe(
    Effect.map(
      (presentation): ToolCallResult => ({
        callId: tc.id,
        name: tc.name,
        args: parsed,
        presentation,
        textContent: presentationToText(presentation),
      }),
    ),
    Effect.mapError(
      (cause) => new ToolCallFailed({ callId: tc.id, name: tc.name, args: parsed, cause }),
    ),
  ) as Effect.Effect<ToolCallResult, ToolCallError, R>;
};

// ---------------------------------------------------------------------------
// foldStreamParts — fold StreamPartEncoded[] into PartEncoded[]
// ---------------------------------------------------------------------------

/** Fold streaming deltas (text-start/text-delta/text-end) back into complete parts. */
const foldStreamParts = (
  streamParts: ReadonlyArray<Response.StreamPartEncoded>,
): Response.PartEncoded[] => {
  const acc = { text: "", reasoning: "", parts: [] as Response.PartEncoded[] };
  for (const part of streamParts) {
    const deltaPart = part as Response.StreamPartEncoded & { readonly delta?: string };
    Match.value(part.type).pipe(
      Match.when("text-delta", () => {
        acc.text += deltaPart.delta ?? "";
      }),
      Match.when("reasoning-delta", () => {
        acc.reasoning += deltaPart.delta ?? "";
      }),
      Match.when("tool-call", () => {
        acc.parts.push(part as Response.PartEncoded);
      }),
      Match.when("finish", () => {
        acc.parts.push(part as Response.PartEncoded);
      }),
      Match.when("error", () => {
        acc.parts.push(part as Response.PartEncoded);
      }),
      Match.orElse(() => undefined),
    );
  }

  return [
    ...(acc.reasoning
      ? ([{ type: "reasoning", text: acc.reasoning }] as Response.PartEncoded[])
      : []),
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
 */
export const stepStream = (
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  tools: ReadonlyArray<ToolAnyWith<unknown>>,
  dispatchId: string,
  agentName: string,
  onChunk: (chunk: StreamDelta) => Effect.Effect<void>,
): Effect.Effect<StepResult, DispatchModelFailed, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const prompt = Prompt.make(messages);
    const toolkit = toolsArrayToAiToolkit(tools);

    // Collect all parts from the stream
    const allParts: Response.StreamPartEncoded[] = [];

    yield* mapAiErrors(
      dispatchId,
      agentName,
      LanguageModel.streamText({
        prompt,
        toolkit,
        disableToolCallResolution: true,
      }).pipe(
        Stream.tap((part) => {
          const encodedPart = part as unknown as Response.StreamPartEncoded;
          allParts.push(encodedPart);
          const deltaPart = encodedPart as Response.StreamPartEncoded & { readonly delta?: string };
          return Match.value(encodedPart.type).pipe(
            Match.when("text-delta", () =>
              onChunk({ type: "text-delta", delta: deltaPart.delta ?? "" }),
            ),
            Match.when("reasoning-delta", () =>
              onChunk({ type: "reasoning-delta", delta: deltaPart.delta ?? "" }),
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
  tools: ReadonlyArray<ToolAnyWith<unknown>>,
  dispatchId: string,
  agentName: string,
): Effect.Effect<StepResult, DispatchModelFailed, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const prompt = Prompt.make(messages);
    const toolkit = toolsArrayToAiToolkit(tools);

    const response = yield* mapAiErrors(
      dispatchId,
      agentName,
      LanguageModel.generateText({
        prompt,
        toolkit,
        disableToolCallResolution: true,
      }),
    );

    return responsePartsToStepResult(
      response.content.map((p) => {
        const encodedPart = p as unknown as Response.PartEncoded & {
          readonly text?: string;
          readonly id?: string;
          readonly name?: string;
          readonly params?: unknown;
        };
        return Match.value(encodedPart.type).pipe(
          Match.when("text", () => ({ type: "text" as const, text: encodedPart.text ?? "" })),
          Match.when("reasoning", () => ({
            type: "reasoning" as const,
            text: encodedPart.text ?? "",
          })),
          Match.when("tool-call", () => ({
            type: "tool-call" as const,
            id: encodedPart.id ?? "",
            name: encodedPart.name ?? "",
            params: encodedPart.params,
          })),
          Match.when("finish", () => encodedPart),
          Match.orElse(() => encodedPart),
        );
      }),
    );
  });
