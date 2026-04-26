import { Effect, Match, Stream } from "effect";
import type * as Response from "effect/unstable/ai/Response";
import { CopilotParseError } from "./errors.ts";
import { parseToolParams } from "./response-parser.ts";
import type { ChatCompletionsWire, ResponsesSSEEvent } from "./wire.ts";
import { makeFinishPart, sanitizeCallId, streamPart } from "./wire.ts";

export const parseSSELines = <E>(raw: Stream.Stream<Uint8Array, E>): Stream.Stream<string, E> => {
  const decoder = new TextDecoder();
  return raw.pipe(
    Stream.map((chunk) => decoder.decode(chunk, { stream: true })),
    Stream.mapAccum(
      () => "",
      (buffer: string, chunk: string) => {
        const combined = buffer + chunk;
        const parts = combined.split("\n");
        const carry = parts.pop() ?? "";
        return [carry, parts] as const;
      },
    ),
    Stream.filter((line): line is string => typeof line === "string" && line.startsWith("data: ")),
    Stream.map((line) => line.slice(6)),
    Stream.takeWhile((data) => data !== "[DONE]"),
  );
};

export class StreamAccumulator {
  readonly parts: Response.StreamPartEncoded[] = [];
  private readonly indexMap = new Map<number, { id: string; name: string; args: string }>();
  private readonly responsesCallMap = new Map<
    string,
    { id: string; name: string; args: string; done: boolean }
  >();
  private readonly responsesCallOrder: string[] = [];
  private textId = "";
  private reasoningId = "";

  constructor(private readonly now: () => number) {}

  addChatCompletionsDelta(
    delta: NonNullable<NonNullable<ChatCompletionsWire["choices"]>[number]["delta"]>,
  ): Response.StreamPartEncoded | null {
    if (delta.tool_calls) {
      delta.tool_calls.forEach((tc) => {
        const existing = this.indexMap.get(tc.index);
        if (!existing) {
          this.indexMap.set(tc.index, {
            id: tc.id ?? "",
            name: tc.function?.name ?? "",
            args: tc.function?.arguments ?? "",
          });
        } else if (tc.function?.arguments) existing.args += tc.function.arguments;
      });
      return null;
    }
    return Match.value(true).pipe(
      Match.when(
        () => !!delta.reasoning_content,
        () => {
          if (!this.reasoningId) {
            this.reasoningId = `reasoning_${this.now()}`;
          }
          return streamPart({
            type: "reasoning-delta",
            id: this.reasoningId,
            delta: delta.reasoning_content,
          });
        },
      ),
      Match.when(
        () => !!delta.content,
        () => {
          if (!this.textId) {
            this.textId = `text_${this.now()}`;
          }
          return streamPart({ type: "text-delta", id: this.textId, delta: delta.content });
        },
      ),
      Match.orElse(() => null),
    );
  }

  addResponsesEvent(
    data: ResponsesSSEEvent,
  ): Effect.Effect<Response.StreamPartEncoded | null, CopilotParseError> {
    const eventType = data.type ?? "";
    return Match.value(eventType).pipe(
      Match.when("response.output_item.added", () => {
        if (data.item?.type !== "function_call") return Effect.succeed(null);
        const callId = sanitizeCallId(data.item.call_id ?? data.item.id ?? `call_${this.now()}`);
        this.responsesCallMap.set(callId, {
          id: callId,
          name: data.item.name ?? "",
          args: "",
          done: false,
        });
        this.responsesCallOrder.push(callId);
        return Effect.succeed(null);
      }),
      Match.when("response.function_call_arguments.done", () => {
        const callId = data.call_id ? sanitizeCallId(data.call_id) : undefined;
        let entry = callId ? this.responsesCallMap.get(callId) : undefined;
        if (!entry) {
          entry = this.responsesCallOrder
            .map((key) => this.responsesCallMap.get(key))
            .find((candidate) => candidate && !candidate.done);
        }
        if (!entry) return Effect.succeed(null);
        entry.args = data.arguments ?? entry.args;
        entry.done = true;
        return parseToolParams(entry.args).pipe(
          Effect.map((params) =>
            streamPart({
              type: "tool-call",
              id: entry.id,
              name: entry.name || data.name || "",
              params,
            }),
          ),
        );
      }),
      Match.when("response.output_text.delta", () => {
        if (!data.delta) return Effect.succeed(null);
        if (!this.textId) {
          this.textId = `text_${this.now()}`;
        }
        return Effect.succeed(
          streamPart({ type: "text-delta", id: this.textId, delta: data.delta }),
        );
      }),
      Match.when("response.reasoning_text.delta", () => {
        if (!data.delta) return Effect.succeed(null);
        if (!this.reasoningId) {
          this.reasoningId = `reasoning_${this.now()}`;
        }
        return Effect.succeed(
          streamPart({ type: "reasoning-delta", id: this.reasoningId, delta: data.delta }),
        );
      }),
      Match.orElse(() => Effect.succeed(null)),
    );
  }

  buildFinalParts(): Effect.Effect<Response.StreamPartEncoded[], CopilotParseError> {
    const acc = this;
    return Effect.gen(function* () {
      const final: Response.StreamPartEncoded[] = [];

      if (acc.textId) final.push(streamPart({ type: "text-end", id: acc.textId }));
      if (acc.reasoningId) final.push(streamPart({ type: "reasoning-end", id: acc.reasoningId }));

      const chatToolCalls = yield* Effect.forEach(
        [...acc.indexMap.entries()].sort(([a], [b]) => a - b),
        ([, tc]) =>
          Effect.gen(function* () {
            const params = yield* parseToolParams(tc.args);
            return streamPart({
              type: "tool-call",
              id: tc.id,
              name: tc.name,
              params,
            });
          }),
      );
      final.push(...chatToolCalls);

      const responseToolCalls = yield* Effect.forEach(
        acc.responsesCallOrder
          .map((key) => acc.responsesCallMap.get(key))
          .filter((tc): tc is NonNullable<typeof tc> => !!tc && !tc.done),
        (tc) =>
          Effect.gen(function* () {
            const params = yield* parseToolParams(tc.args);
            return streamPart({
              type: "tool-call",
              id: tc.id,
              name: tc.name,
              params,
            });
          }),
      );
      final.push(...responseToolCalls);

      const hasToolCalls = acc.indexMap.size > 0 || acc.responsesCallOrder.length > 0;
      final.push(makeFinishPart(hasToolCalls ? "tool-calls" : "stop", 0, 0));

      return final;
    });
  }
}

export const processSSEChunkToStreamPart = (
  data: string,
  acc: StreamAccumulator,
  useResponses: boolean,
): Effect.Effect<Response.StreamPartEncoded | null, CopilotParseError> => {
  if (data.trim() === "") return Effect.succeed(null);

  return Effect.try({
    try: () => JSON.parse(data),
    catch: (cause) => new CopilotParseError({ cause }),
  }).pipe(
    Effect.flatMap((parsed) => {
      if (useResponses) {
        return acc.addResponsesEvent(parsed as ResponsesSSEEvent);
      }
      const wire = parsed as ChatCompletionsWire;
      const choice = wire.choices?.[0];
      if (choice?.delta) return Effect.succeed(acc.addChatCompletionsDelta(choice.delta));
      return Effect.succeed(null);
    }),
  );
};
