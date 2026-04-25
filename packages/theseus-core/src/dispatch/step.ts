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

import { Effect } from "effect";
import type * as AiError from "effect/unstable/ai/AiError";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as Prompt from "effect/unstable/ai/Prompt";
import type * as Response from "effect/unstable/ai/Response";
import type * as AiTool from "effect/unstable/ai/Tool";
import { toolsArrayToAiToolkit } from "../bridge/to-ai-tools.ts";
import type { Content, Presentation, ToolAnyWith } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";
import type { StepResult, ToolCall, ToolCallError, ToolCallResult, Usage } from "./types.ts";
import { DispatchModelFailed, ToolCallBadArgs, ToolCallFailed, ToolCallUnknown } from "./types.ts";

// ---------------------------------------------------------------------------
// responseToStepResult — translate Effect/AI response into Theseus step output
// ---------------------------------------------------------------------------

const usageToUsage = (usage: Response.Usage): Usage => ({
  inputTokens: usage.inputTokens.total ?? 0,
  outputTokens: usage.outputTokens.total ?? 0,
});

const stringifyToolParams = (params: unknown): string => JSON.stringify(params) ?? "{}";

const responseToStepResult = (
  response: LanguageModel.GenerateTextResponse<Record<string, AiTool.Any>>,
): StepResult => {
  const toolCalls: ToolCall[] = response.toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.name,
    arguments: stringifyToolParams(tc.params),
  }));

  return {
    content: response.text,
    ...(response.reasoningText ? { thinking: response.reasoningText } : {}),
    toolCalls,
    usage: usageToUsage(response.usage),
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

    return responseToStepResult(response);
  });
