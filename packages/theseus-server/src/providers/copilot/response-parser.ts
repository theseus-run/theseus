import { Effect, Match } from "effect";
import type * as Response from "effect/unstable/ai/Response";
import { CopilotParseError } from "./errors.ts";
import { decodeJsonEffect } from "./json.ts";
import type { ChatCompletionsWire, ResponsesWire } from "./wire.ts";
import { makeFinishPart, sanitizeCallId } from "./wire.ts";

export const parseToolParams = (raw: string): Effect.Effect<unknown, CopilotParseError> =>
  decodeJsonEffect(raw, (cause) => new CopilotParseError({ cause }));

export const parseChatCompletionsToResponseParts = (
  data: ChatCompletionsWire,
): Effect.Effect<Response.PartEncoded[], CopilotParseError> =>
  Effect.gen(function* () {
    const choice = data.choices?.[0];
    const message = choice?.message;
    const finishReason = choice?.finish_reason ?? "stop";
    const rawUsage = data.usage;
    const parts: Response.PartEncoded[] = [];

    if (message?.reasoning_content) {
      parts.push({ type: "reasoning", text: message.reasoning_content });
    }

    if (message?.content) {
      parts.push({ type: "text", text: message.content });
    }

    if (finishReason === "tool_calls" && message?.tool_calls) {
      const toolCalls = yield* Effect.forEach(message.tool_calls, (tc) =>
        Effect.gen(function* () {
          const params = yield* parseToolParams(tc.function.arguments);
          return {
            type: "tool-call" as const,
            id: tc.id,
            name: tc.function.name,
            params,
          } satisfies Response.ToolCallPartEncoded;
        }),
      );
      parts.push(...toolCalls);
    } else if (!message?.content) {
      parts.push({ type: "text", text: "" });
    }

    parts.push(
      makeFinishPart(
        finishReason === "tool_calls" ? "tool-calls" : "stop",
        rawUsage?.prompt_tokens ?? 0,
        rawUsage?.completion_tokens ?? 0,
      ),
    );

    return parts;
  });

export const parseResponsesResponseToResponseParts = (
  data: ResponsesWire,
): Effect.Effect<Response.PartEncoded[], CopilotParseError> =>
  Effect.gen(function* () {
    const output = data.output ?? [];
    const rawUsage = data.usage;
    const parts: Response.PartEncoded[] = [];
    let hasToolCalls = false;

    const itemGroups = yield* Effect.forEach(
      output,
      (item): Effect.Effect<Response.PartEncoded[], CopilotParseError> =>
        Match.value(item.type).pipe(
          Match.when("function_call", () =>
            Effect.gen(function* () {
              hasToolCalls = true;
              const params = yield* parseToolParams((item["arguments"] as string) ?? "{}");
              return [
                {
                  type: "tool-call" as const,
                  id: sanitizeCallId((item["call_id"] as string) || (item["id"] as string) || ""),
                  name: (item["name"] as string) ?? "",
                  params,
                } satisfies Response.ToolCallPartEncoded,
              ];
            }),
          ),
          Match.when("reasoning", () => {
            const content = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
            const text = content
              .filter((p) => p.type === "reasoning_text" && p.text)
              .map((p) => p.text ?? "")
              .join("");
            return Effect.succeed(text ? [{ type: "reasoning" as const, text }] : []);
          }),
          Match.when("message", () => {
            const content = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
            const text = content
              .filter((p) => p.type === "output_text" && p.text)
              .map((p) => p.text ?? "")
              .join("");
            return Effect.succeed(text ? [{ type: "text" as const, text }] : []);
          }),
          Match.orElse(() => Effect.succeed([])),
        ),
    );
    const items = itemGroups.flat();
    parts.push(...items);

    parts.push(
      makeFinishPart(
        hasToolCalls ? "tool-calls" : "stop",
        rawUsage?.input_tokens ?? 0,
        rawUsage?.output_tokens ?? 0,
      ),
    );

    return parts;
  });
