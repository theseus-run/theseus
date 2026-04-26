import type * as Prompt from "effect/unstable/ai/Prompt";
import { tryParseArgs } from "./step.ts";
import type { ToolCall, ToolCallResult } from "./types.ts";

export const defaultMessages = (
  systemPrompt: string,
  task: string,
): ReadonlyArray<Prompt.MessageEncoded> => [
  { role: "system", content: systemPrompt },
  { role: "user", content: task },
];

export const redirectMessages = (
  previous: ReadonlyArray<Prompt.MessageEncoded>,
  task: string,
): ReadonlyArray<Prompt.MessageEncoded> => [
  previous[0] ?? { role: "system", content: "" },
  { role: "user", content: task },
];

export const finalAssistantMessages = (
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  content: string,
): ReadonlyArray<Prompt.MessageEncoded> => [...messages, { role: "assistant", content }];

export const toolResultMessages = (
  calls: ReadonlyArray<ToolCallResult>,
): ReadonlyArray<Prompt.MessageEncoded> =>
  calls.map((result) => ({
    role: "tool",
    content: [
      {
        type: "tool-result",
        id: result.callId,
        name: result.name,
        isFailure: result.presentation.isError ?? false,
        result: result.textContent,
      },
    ],
  }));

export const assistantToolMessage = (
  content: string,
  toolCalls: ReadonlyArray<ToolCall>,
): Prompt.MessageEncoded => ({
  role: "assistant",
  content: [
    ...(content ? [{ type: "text", text: content } as const] : []),
    ...toolCalls.map((toolCall) => ({
      type: "tool-call" as const,
      id: toolCall.id,
      name: toolCall.name,
      params: tryParseArgs(toolCall),
    })),
  ],
});
