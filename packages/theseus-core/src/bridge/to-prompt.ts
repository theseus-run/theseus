/**
 * Bridge: LLMMessage[] → Prompt.Prompt
 *
 * Converts our internal message format to effect/unstable/ai Prompt.
 * Uses MessageEncoded (wire format) which Prompt.make() accepts directly.
 */

import { Match } from "effect";
import * as Prompt from "effect/unstable/ai/Prompt";
import type { LLMMessage, LLMToolCall } from "../llm/provider.ts";

/** Safely parse JSON args, falling back to empty object. */
const parseParams = (args: string): unknown => {
  try { return JSON.parse(args); }
  catch { return {}; }
};

/** Convert a tool call to the Prompt encoded wire format. */
const toolCallToPart = (tc: LLMToolCall): Prompt.ToolCallPartEncoded => ({
  type: "tool-call",
  id: tc.id,
  name: tc.name,
  params: parseParams(tc.arguments),
});

/** Convert a single LLMMessage to the Prompt MessageEncoded wire format. */
const messageToEncoded = (msg: LLMMessage): Prompt.MessageEncoded =>
  Match.value(msg).pipe(
    Match.when({ role: "system" }, (m) => ({
      role: "system" as const,
      content: m.content,
    })),
    Match.when({ role: "user" }, (m) => ({
      role: "user" as const,
      content: m.content,
    })),
    Match.when({ role: "assistant" }, (m) => {
      const parts: Prompt.AssistantMessagePartEncoded[] = [
        ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
        ...(m.toolCalls ?? []).map(toolCallToPart),
      ];
      return { role: "assistant" as const, content: parts };
    }),
    Match.when({ role: "tool" }, (m) => ({
      role: "tool" as const,
      content: [{
        type: "tool-result" as const,
        id: m.toolCallId,
        name: "",
        isFailure: false,
        result: m.content,
      }],
    })),
    Match.exhaustive,
  );

/**
 * Convert an array of LLMMessage to a Prompt.Prompt.
 */
export const llmMessagesToPrompt = (messages: ReadonlyArray<LLMMessage>): Prompt.Prompt =>
  Prompt.make(messages.map(messageToEncoded));
