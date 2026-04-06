/**
 * Bridge: Response.Part[] / Response.StreamPartEncoded → StepResult
 *
 * Converts effect/unstable/ai Response types back to our dispatch types.
 * Used after LanguageModel.generateText / streamText returns.
 */

import type * as Response from "effect/unstable/ai/Response";
import type { LLMToolCall, LLMUsage } from "../llm/provider.ts";
import type { StepResult } from "../dispatch/types.ts";

/** Zero usage sentinel. */
const ZERO_USAGE: LLMUsage = { inputTokens: 0, outputTokens: 0 };

/**
 * Convert an array of Response.PartEncoded (from generateText) to our StepResult.
 *
 * Extracts text, tool calls, thinking, and usage from the parts.
 */
export const responsePartsToStepResult = (parts: ReadonlyArray<Response.PartEncoded>): StepResult => {
  let text = "";
  let thinking = "";
  const toolCalls: LLMToolCall[] = [];
  let usage: LLMUsage = ZERO_USAGE;

  for (const part of parts) {
    switch (part.type) {
      case "text":
        text += (part as { text: string }).text;
        break;
      case "reasoning":
        thinking += (part as { text: string }).text;
        break;
      case "tool-call": {
        const tc = part as { id: string; name: string; params: unknown };
        toolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.params),
        });
        break;
      }
      case "finish": {
        const fin = part as { usage?: { inputTokens?: { total?: number }; outputTokens?: { total?: number } } };
        if (fin.usage) {
          usage = {
            inputTokens: fin.usage.inputTokens?.total ?? 0,
            outputTokens: fin.usage.outputTokens?.total ?? 0,
          };
        }
        break;
      }
    }
  }

  if (toolCalls.length > 0) {
    return {
      _tag: "tool_calls",
      toolCalls,
      ...(thinking ? { thinking } : {}),
      usage,
    };
  }

  return {
    _tag: "text",
    content: text,
    ...(thinking ? { thinking } : {}),
    usage,
  };
};
