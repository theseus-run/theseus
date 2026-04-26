import { Effect, Match } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import * as AiTool from "effect/unstable/ai/Tool";
import { CopilotEncodeError } from "./errors.ts";

const textFromParts = (parts: ReadonlyArray<Prompt.Part>): string =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

const encodeJson = (value: unknown, fallback: unknown): Effect.Effect<string, CopilotEncodeError> =>
  Effect.try({
    try: () => JSON.stringify(value ?? fallback) ?? "null",
    catch: (cause) => new CopilotEncodeError({ cause }),
  });

const unsupportedPromptPart = (
  role: Prompt.Message["role"],
  part: Prompt.Part,
): CopilotEncodeError =>
  new CopilotEncodeError({ cause: `Unsupported ${role} prompt part: ${part.type}` });

/** Convert Prompt messages to /chat/completions wire format. */
export const promptToChatCompletions = (
  prompt: Prompt.Prompt,
): Effect.Effect<unknown[], CopilotEncodeError> =>
  Effect.forEach(prompt.content, (msg) =>
    Match.value(msg).pipe(
      Match.when({ role: "system" }, (message) =>
        Effect.succeed({ role: "system", content: message.content }),
      ),
      Match.when({ role: "user" }, (message) => {
        const unsupported = message.content.find((part) => part.type !== "text");
        if (unsupported) return Effect.fail(unsupportedPromptPart(message.role, unsupported));
        return Effect.succeed({ role: "user", content: textFromParts(message.content) });
      }),
      Match.when({ role: "assistant" }, (message) =>
        Effect.gen(function* () {
          const unsupported = message.content.find(
            (part) => part.type !== "text" && part.type !== "tool-call",
          );
          if (unsupported) {
            return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
          }
          const parts = message.content;
          const textParts = parts.filter((p) => p.type === "text");
          const toolCallParts = parts.filter((p) => p.type === "tool-call");
          const content = textFromParts(textParts) || null;
          if (toolCallParts.length > 0) {
            const toolCalls = yield* Effect.forEach(toolCallParts, (tc) =>
              encodeJson(tc.params, {}).pipe(
                Effect.map((args) => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: args },
                })),
              ),
            );
            return {
              role: "assistant",
              content,
              tool_calls: toolCalls,
            };
          }
          return { role: "assistant", content };
        }),
      ),
      Match.when({ role: "tool" }, (message) =>
        Effect.gen(function* () {
          const result = message.content.find((p) => p.type === "tool-result");
          if (!result) {
            const unsupported = message.content[0];
            if (unsupported) {
              return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
            }
          }
          const content =
            typeof result?.result === "string"
              ? result.result
              : yield* encodeJson(result?.result, "");
          return {
            role: "tool",
            tool_call_id: result?.id ?? "",
            content,
          };
        }),
      ),
      Match.exhaustive,
    ),
  );

/** Convert Prompt messages to /responses wire format. */
export const promptToResponsesInput = (
  prompt: Prompt.Prompt,
): Effect.Effect<unknown[], CopilotEncodeError> =>
  Effect.gen(function* () {
    const itemGroups = yield* Effect.forEach(prompt.content, (msg) =>
      Match.value(msg).pipe(
        Match.when({ role: "system" }, (message) =>
          Effect.succeed([{ role: "system", content: message.content }]),
        ),
        Match.when({ role: "user" }, (message) => {
          const unsupported = message.content.find((part) => part.type !== "text");
          if (unsupported) return Effect.fail(unsupportedPromptPart(message.role, unsupported));
          return Effect.succeed([{ role: "user", content: textFromParts(message.content) }]);
        }),
        Match.when({ role: "assistant" }, (message) =>
          Effect.gen(function* () {
            const unsupported = message.content.find(
              (part) => part.type !== "text" && part.type !== "tool-call",
            );
            if (unsupported) {
              return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
            }
            const parts = message.content;
            const textParts = parts.filter((p) => p.type === "text");
            const toolCallParts = parts.filter((p) => p.type === "tool-call");
            const items: unknown[] = [];
            const text = textFromParts(textParts);
            if (text) items.push({ role: "assistant", content: text });
            const toolCalls = yield* Effect.forEach(toolCallParts, (tc) =>
              encodeJson(tc.params, {}).pipe(
                Effect.map((args) => ({
                  type: "function_call",
                  call_id: tc.id,
                  name: tc.name,
                  arguments: args,
                })),
              ),
            );
            items.push(...toolCalls);
            return items;
          }),
        ),
        Match.when({ role: "tool" }, (message) =>
          Effect.gen(function* () {
            const unsupported = message.content.find((part) => part.type !== "tool-result");
            if (unsupported) {
              return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
            }
            return yield* Effect.forEach(
              message.content.filter((p) => p.type === "tool-result"),
              (r) =>
                Effect.gen(function* () {
                  const output =
                    typeof r.result === "string" ? r.result : yield* encodeJson(r.result, "");
                  return {
                    type: "function_call_output",
                    call_id: r.id,
                    output,
                  };
                }),
            );
          }),
        ),
        Match.exhaustive,
      ),
    );
    return itemGroups.flat();
  });

/** Get the JSON schema for a tool through Effect/AI's public schema accessor. */
const getToolSchema = (t: AiTool.Any): Record<string, unknown> =>
  AiTool.getJsonSchema(t) ?? { type: "object", properties: {} };

/** Convert AI Tool definitions to /chat/completions tools format. */
export const aiToolsToChatCompletionsTools = (tools: ReadonlyArray<AiTool.Any>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: AiTool.getDescription(t) ?? "",
      parameters: getToolSchema(t),
    },
  }));

/** Convert AI Tool definitions to /responses tools format. */
export const aiToolsToResponsesTools = (tools: ReadonlyArray<AiTool.Any>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    name: t.name,
    description: AiTool.getDescription(t) ?? "",
    parameters: getToolSchema(t),
  }));
