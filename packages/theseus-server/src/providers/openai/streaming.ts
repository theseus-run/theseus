import { Effect, Match, Stream } from "effect";
import type * as Response from "effect/unstable/ai/Response";
import { OpenAIParseError } from "./errors.ts";
import { decodeJsonEffect } from "./json.ts";
import { parseToolParams } from "./response-parser.ts";
import type { ResponsesSSEEvent } from "./wire.ts";
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
  private readonly callMap = new Map<
    string,
    { id: string; name: string; args: string; emitted: boolean }
  >();
  private readonly callOrder: string[] = [];
  private textId = "";
  private reasoningId = "";
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(private readonly now: () => number) {}

  addResponsesEvent(
    data: ResponsesSSEEvent,
  ): Effect.Effect<Response.StreamPartEncoded | null, OpenAIParseError> {
    const eventType = data.type ?? "";
    return Match.value(eventType).pipe(
      Match.when("response.output_item.added", () => {
        if (data.item?.type !== "function_call") return Effect.succeed(null);
        const id = sanitizeCallId(data.item.call_id ?? data.item.id ?? `call_${this.now()}`);
        this.callMap.set(id, {
          id,
          name: data.item.name ?? "",
          args: data.item.arguments ?? "",
          emitted: false,
        });
        this.callOrder.push(id);
        return Effect.succeed(null);
      }),
      Match.when("response.function_call_arguments.delta", () => {
        const id = this.findOrCreateCallId(data);
        const entry = this.callMap.get(id);
        if (entry && data.delta) {
          entry.args += data.delta;
        }
        return Effect.succeed(null);
      }),
      Match.when("response.function_call_arguments.done", () => {
        const id = this.findOrCreateCallId(data);
        const entry = this.callMap.get(id);
        if (!entry) return Effect.succeed(null);
        entry.args = data.arguments ?? entry.args;
        entry.emitted = true;
        return parseToolParams(entry.args || "{}").pipe(
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
        if (!this.textId) this.textId = `text_${this.now()}`;
        return Effect.succeed(
          streamPart({ type: "text-delta", id: this.textId, delta: data.delta }),
        );
      }),
      Match.when("response.reasoning_text.delta", () => {
        if (!data.delta) return Effect.succeed(null);
        if (!this.reasoningId) this.reasoningId = `reasoning_${this.now()}`;
        return Effect.succeed(
          streamPart({ type: "reasoning-delta", id: this.reasoningId, delta: data.delta }),
        );
      }),
      Match.when("response.completed", () => {
        this.inputTokens = data.response?.usage?.input_tokens ?? this.inputTokens;
        this.outputTokens = data.response?.usage?.output_tokens ?? this.outputTokens;
        return Effect.succeed(null);
      }),
      Match.orElse(() => Effect.succeed(null)),
    );
  }

  buildFinalParts(): Effect.Effect<Response.StreamPartEncoded[], OpenAIParseError> {
    const acc = this;
    return Effect.gen(function* () {
      const final: Response.StreamPartEncoded[] = [];
      if (acc.textId) final.push(streamPart({ type: "text-end", id: acc.textId }));
      if (acc.reasoningId) {
        final.push(streamPart({ type: "reasoning-end", id: acc.reasoningId }));
      }
      const pendingToolCalls = yield* Effect.forEach(
        acc.callOrder
          .map((id) => acc.callMap.get(id))
          .filter((call): call is NonNullable<typeof call> => !!call && !call.emitted),
        (call) =>
          parseToolParams(call.args || "{}").pipe(
            Effect.map((params) =>
              streamPart({
                type: "tool-call",
                id: call.id,
                name: call.name,
                params,
              }),
            ),
          ),
      );
      final.push(...pendingToolCalls);
      const hasToolCalls = acc.callOrder.length > 0;
      final.push(
        makeFinishPart(hasToolCalls ? "tool-calls" : "stop", acc.inputTokens, acc.outputTokens),
      );
      return final;
    });
  }

  private findOrCreateCallId(data: ResponsesSSEEvent): string {
    const provided = data.call_id ? sanitizeCallId(data.call_id) : undefined;
    if (provided) {
      if (!this.callMap.has(provided)) {
        this.callMap.set(provided, {
          id: provided,
          name: data.name ?? "",
          args: "",
          emitted: false,
        });
        this.callOrder.push(provided);
      }
      return provided;
    }
    const existing = this.callOrder.at(-1);
    if (existing) return existing;
    const id = `call_${this.now()}`;
    this.callMap.set(id, { id, name: data.name ?? "", args: "", emitted: false });
    this.callOrder.push(id);
    return id;
  }
}

export const processSSEChunkToStreamPart = (
  data: string,
  acc: StreamAccumulator,
): Effect.Effect<Response.StreamPartEncoded | null, OpenAIParseError> => {
  if (data.trim() === "") return Effect.succeed(null);
  return decodeJsonEffect(data, (cause) => new OpenAIParseError({ cause })).pipe(
    Effect.flatMap((parsed) => acc.addResponsesEvent(parsed as ResponsesSSEEvent)),
  );
};
