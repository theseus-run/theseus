import { Effect, Match } from "effect";
import type * as Response from "effect/unstable/ai/Response";
import { OpenAIParseError } from "./errors.ts";
import { decodeJsonEffect } from "./json.ts";
import type { ResponsesWire } from "./wire.ts";
import { makeFinishPart, sanitizeCallId } from "./wire.ts";

export const parseToolParams = (raw: string): Effect.Effect<unknown, OpenAIParseError> =>
  decodeJsonEffect(raw, (cause) => new OpenAIParseError({ cause }));

const outputText = (content: ReadonlyArray<{ readonly type: string; readonly text?: string }>) =>
  content
    .filter((part) => part.type === "output_text" && part.text)
    .map((part) => part.text ?? "")
    .join("");

const reasoningText = (content: ReadonlyArray<{ readonly type: string; readonly text?: string }>) =>
  content
    .filter((part) => (part.type === "reasoning_text" || part.type === "summary_text") && part.text)
    .map((part) => part.text ?? "")
    .join("");

export const parseResponsesResponseToResponseParts = (
  data: ResponsesWire,
): Effect.Effect<Response.PartEncoded[], OpenAIParseError> =>
  Effect.gen(function* () {
    const output = data.output ?? [];
    const rawUsage = data.usage;
    const parts: Response.PartEncoded[] = [];
    let hasToolCalls = false;

    const itemGroups = yield* Effect.forEach(
      output,
      (item): Effect.Effect<Response.PartEncoded[], OpenAIParseError> =>
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
            const content =
              (item["content"] as ReadonlyArray<{ type: string; text?: string }>) ?? [];
            const text = reasoningText(content);
            return Effect.succeed(text ? [{ type: "reasoning" as const, text }] : []);
          }),
          Match.when("message", () => {
            const content =
              (item["content"] as ReadonlyArray<{ type: string; text?: string }>) ?? [];
            const text = outputText(content);
            return Effect.succeed(text ? [{ type: "text" as const, text }] : []);
          }),
          Match.orElse(() => Effect.succeed([])),
        ),
    );

    parts.push(...itemGroups.flat());
    if (parts.length === 0) parts.push({ type: "text", text: "" });
    parts.push(
      makeFinishPart(
        hasToolCalls ? "tool-calls" : "stop",
        rawUsage?.input_tokens ?? 0,
        rawUsage?.output_tokens ?? 0,
      ),
    );
    return parts;
  });
