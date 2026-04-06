/**
 * Bridge: LLMMessage[] → Prompt.Prompt
 *
 * Converts our internal message format to @effect/ai Prompt types.
 * Used when calling LanguageModel.generateText / streamText.
 */

import * as Prompt from "effect/unstable/ai/Prompt";
import type { LLMMessage } from "../llm/provider.ts";

/**
 * Convert an array of LLMMessage to a Prompt.Prompt.
 *
 * Mapping:
 *   system    → Prompt.SystemMessage
 *   user      → Prompt.UserMessage with TextPart
 *   assistant → Prompt.AssistantMessage with TextPart + ToolCallParts
 *   tool      → Prompt.ToolMessage with ToolResultPart
 */
export const llmMessagesToPrompt = (messages: ReadonlyArray<LLMMessage>): Prompt.Prompt => {
  const promptMessages: Array<Prompt.Message> = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        promptMessages.push(Prompt.systemMessage(msg.content));
        break;

      case "user":
        promptMessages.push(Prompt.userMessage(msg.content));
        break;

      case "assistant": {
        const parts: Array<Prompt.Part> = [];
        if (msg.content) {
          parts.push(Prompt.makePart("text", { text: msg.content }));
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            let params: unknown;
            try {
              params = JSON.parse(tc.arguments);
            } catch {
              params = {};
            }
            parts.push(
              Prompt.makePart("tool-call", {
                id: tc.id,
                name: tc.name,
                params,
              }),
            );
          }
        }
        promptMessages.push(Prompt.assistantMessage(parts));
        break;
      }

      case "tool":
        promptMessages.push(
          Prompt.toolMessage({
            toolCallId: msg.toolCallId,
            result: msg.content,
          }),
        );
        break;
    }
  }

  return Prompt.make(promptMessages);
};
