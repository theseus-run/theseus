/**
 * Step — one LLM call via LanguageModel. Pure — no tool execution, no loop.
 *
 *   step(messages, tools, dispatchId, name)
 *     → StepResult { content, thinking?, toolCalls, usage }
 *
 * Tool execution is the caller's responsibility. This keeps step() pure
 * and gives callers control over intermediate steps (event emission,
 * interrupt checks) between receiving tool_calls and executing them.
 *
 * Uses LanguageModel from effect/unstable/ai with disableToolCallResolution: true
 * so that our dispatch loop retains full control over tool execution.
 */

import { Effect, Match } from "effect";
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

  return {
    content: text,
    ...(thinking ? { thinking } : {}),
    toolCalls,
    usage: extractUsage(parts),
  };
};

// ---------------------------------------------------------------------------
// mapAiError — convert AiError to DispatchError
// ---------------------------------------------------------------------------

const mapAiErrors = <A, R>(
  dispatchId: string,
  name: string,
  effect: Effect.Effect<A, AiError.AiError, R>,
): Effect.Effect<A, DispatchModelFailed, R> =>
  effect.pipe(
    Effect.catchTag("AiError", (e) =>
      Effect.fail(
        new DispatchModelFailed({
          dispatchId,
          name,
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
  if (parsed === tc.arguments)
    return Effect.fail(new ToolCallBadArgs({ callId: tc.id, name: tc.name, raw: tc.arguments }));

  return callTool(tool, parsed).pipe(
    Effect.map(
      (outcome): ToolCallResult => ({
        callId: tc.id,
        name: tc.name,
        args: outcome.input,
        outcome,
        presentation: outcome.presentation,
        textContent: presentationToText(outcome.presentation),
      }),
    ),
    Effect.mapError(
      (cause) => new ToolCallFailed({ callId: tc.id, name: tc.name, args: parsed, cause }),
    ),
  ) as Effect.Effect<ToolCallResult, ToolCallError, R>;
};

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
