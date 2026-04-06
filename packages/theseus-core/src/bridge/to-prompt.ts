/**
 * Bridge: LLMMessage[] → Prompt.Prompt
 *
 * Converts our internal message format to effect/unstable/ai Prompt.
 * Uses MessageEncoded (wire format) which Prompt.make() accepts directly.
 */

import * as Prompt from "effect/unstable/ai/Prompt";
import type { LLMMessage } from "../llm/provider.ts";

/**
 * Convert an array of LLMMessage to a Prompt.Prompt.
 *
 * Mapping:
 *   system    → { role: "system", content: string }
 *   user      → { role: "user", content: string }
 *   assistant → { role: "assistant", content: [TextPart?, ...ToolCallParts?] }
 *   tool      → { role: "tool", content: [ToolResultPart] }
 */
export const llmMessagesToPrompt = (messages: ReadonlyArray<LLMMessage>): Prompt.Prompt => {
  const encoded: Prompt.MessageEncoded[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        encoded.push({ role: "system", content: msg.content });
        break;

      case "user":
        encoded.push({ role: "user", content: msg.content });
        break;

      case "assistant": {
        const parts: Prompt.AssistantMessagePartEncoded[] = [];
        if (msg.content) {
          parts.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            let params: unknown;
            try {
              params = JSON.parse(tc.arguments);
            } catch {
              params = {};
            }
            parts.push({
              type: "tool-call",
              id: tc.id,
              name: tc.name,
              params,
            });
          }
        }
        encoded.push({ role: "assistant", content: parts });
        break;
      }

      case "tool":
        encoded.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              id: msg.toolCallId,
              name: "",  // we don't track tool name in LLMMessage.tool
              isFailure: false,
              result: msg.content,
            },
          ],
        });
        break;
    }
  }

  return Prompt.make(encoded);
};
