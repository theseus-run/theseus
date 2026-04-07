/**
 * Bridge: Response.PartEncoded[] → StepResult
 *
 * Converts effect/unstable/ai Response types back to our dispatch types.
 * Used after LanguageModel.generateText / streamText returns.
 */

import { Match } from "effect";
import type * as Response from "effect/unstable/ai/Response";
import type { StepResult, ToolCall, Usage } from "../dispatch/types.ts";

/**
 * Fold response parts into accumulated text, thinking, tool calls, and usage.
 */
const foldParts = (parts: ReadonlyArray<Response.PartEncoded>) =>
  parts.reduce(
    (acc, part) =>
      Match.value(part.type).pipe(
        Match.when("text", () => ({ ...acc, text: acc.text + (part as { text: string }).text })),
        Match.when("reasoning", () => ({ ...acc, thinking: acc.thinking + (part as { text: string }).text })),
        Match.when("tool-call", () => {
          const tc = part as { id: string; name: string; params: unknown };
          return {
            ...acc,
            toolCalls: [...acc.toolCalls, { id: tc.id, name: tc.name, arguments: JSON.stringify(tc.params) }],
          };
        }),
        Match.when("finish", () => ({
          ...acc,
          usage: {
            inputTokens: (part as any).usage?.inputTokens?.total ?? acc.usage.inputTokens,
            outputTokens: (part as any).usage?.outputTokens?.total ?? acc.usage.outputTokens,
          },
        })),
        Match.orElse(() => acc),
      ),
    { text: "", thinking: "", toolCalls: [] as ToolCall[], usage: { inputTokens: 0, outputTokens: 0 } as Usage },
  );

/**
 * Convert an array of Response.PartEncoded (from generateText) to our StepResult.
 */
export const responsePartsToStepResult = (parts: ReadonlyArray<Response.PartEncoded>): StepResult => {
  const { text, thinking, toolCalls, usage } = foldParts(parts);

  return toolCalls.length > 0
    ? { _tag: "tool_calls", toolCalls, ...(thinking ? { thinking } : {}), usage }
    : { _tag: "text", content: text, ...(thinking ? { thinking } : {}), usage };
};
