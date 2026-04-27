import { Effect, Match } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import * as AiTool from "effect/unstable/ai/Tool";
import { OpenAIEncodeError } from "./errors.ts";
import { encodeJsonEffect } from "./json.ts";

const textFromParts = (parts: ReadonlyArray<Prompt.Part>): string =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

const encodeJson = (value: unknown, fallback: unknown): Effect.Effect<string, OpenAIEncodeError> =>
  encodeJsonEffect(value ?? fallback, (cause) => new OpenAIEncodeError({ cause }));

const unsupportedPromptPart = (
  role: Prompt.Message["role"],
  part: Prompt.Part,
): OpenAIEncodeError =>
  new OpenAIEncodeError({ cause: `Unsupported ${role} prompt part: ${part.type}` });

export const promptToResponsesInput = (
  prompt: Prompt.Prompt,
): Effect.Effect<unknown[], OpenAIEncodeError> =>
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
              return yield* unsupportedPromptPart(message.role, unsupported);
            }
            const parts = message.content;
            const text = textFromParts(parts.filter((part) => part.type === "text"));
            const items: unknown[] = text ? [{ role: "assistant", content: text }] : [];
            const toolCalls = yield* Effect.forEach(
              parts.filter((part) => part.type === "tool-call"),
              (toolCall) =>
                encodeJson(toolCall.params, {}).pipe(
                  Effect.map((args) => ({
                    type: "function_call",
                    call_id: toolCall.id,
                    name: toolCall.name,
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
              return yield* unsupportedPromptPart(message.role, unsupported);
            }
            return yield* Effect.forEach(
              message.content.filter((part) => part.type === "tool-result"),
              (result) =>
                Effect.gen(function* () {
                  const output =
                    typeof result.result === "string"
                      ? result.result
                      : yield* encodeJson(result.result, "");
                  return {
                    type: "function_call_output",
                    call_id: result.id,
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

const getToolSchema = (tool: AiTool.Any): Record<string, unknown> =>
  (AiTool.getJsonSchema(tool) as Record<string, unknown> | undefined) ?? {
    type: "object",
    properties: {},
  };

export const aiToolsToResponsesTools = (tools: ReadonlyArray<AiTool.Any>): unknown[] =>
  tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: AiTool.getDescription(tool) ?? "",
    parameters: getToolSchema(tool),
  }));
