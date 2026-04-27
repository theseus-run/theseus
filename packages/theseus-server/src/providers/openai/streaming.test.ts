import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { OpenAIParseError } from "./errors.ts";
import { processSSEChunkToStreamPart, StreamAccumulator } from "./streaming.ts";

describe("openai streaming parsing", () => {
  test("fails malformed SSE event JSON", async () => {
    const acc = new StreamAccumulator(() => 1);

    await expect(Effect.runPromise(processSSEChunkToStreamPart("{", acc))).rejects.toBeInstanceOf(
      OpenAIParseError,
    );
  });

  test("streams text deltas and final usage", async () => {
    const acc = new StreamAccumulator(() => 1);

    const part = await Effect.runPromise(
      processSSEChunkToStreamPart(
        JSON.stringify({ type: "response.output_text.delta", delta: "hello" }),
        acc,
      ),
    );
    await Effect.runPromise(
      processSSEChunkToStreamPart(
        JSON.stringify({
          type: "response.completed",
          response: { usage: { input_tokens: 9, output_tokens: 3 } },
        }),
        acc,
      ),
    );
    const final = await Effect.runPromise(acc.buildFinalParts());

    expect(part).toMatchObject({ type: "text-delta", delta: "hello" });
    expect(final.map((item) => item.type)).toEqual(["text-end", "finish"]);
    expect(final[1]).toMatchObject({
      type: "finish",
      reason: "stop",
      usage: { inputTokens: { total: 9 }, outputTokens: { total: 3 } },
    });
  });

  test("emits responses tool call when arguments complete", async () => {
    const acc = new StreamAccumulator(() => 1);

    await Effect.runPromise(
      processSSEChunkToStreamPart(
        JSON.stringify({
          type: "response.output_item.added",
          item: { type: "function_call", call_id: "call-2", name: "lookup" },
        }),
        acc,
      ),
    );

    const part = await Effect.runPromise(
      processSSEChunkToStreamPart(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          call_id: "call-2",
          arguments: JSON.stringify({ q: "beta" }),
        }),
        acc,
      ),
    );
    const final = await Effect.runPromise(acc.buildFinalParts());

    expect(part).toMatchObject({
      type: "tool-call",
      id: "call-2",
      name: "lookup",
      params: { q: "beta" },
    });
    expect(final[0]).toMatchObject({ type: "finish", reason: "tool-calls" });
  });

  test("flushes accumulated tool call arguments at finalization", async () => {
    const acc = new StreamAccumulator(() => 1);

    await Effect.runPromise(
      processSSEChunkToStreamPart(
        JSON.stringify({
          type: "response.output_item.added",
          item: { type: "function_call", call_id: "call-3", name: "lookup" },
        }),
        acc,
      ),
    );
    await Effect.runPromise(
      processSSEChunkToStreamPart(
        JSON.stringify({
          type: "response.function_call_arguments.delta",
          call_id: "call-3",
          delta: '{"q":"gamma"}',
        }),
        acc,
      ),
    );

    const final = await Effect.runPromise(acc.buildFinalParts());

    expect(final.map((part) => part.type)).toEqual(["tool-call", "finish"]);
    expect(final[0]).toMatchObject({
      type: "tool-call",
      id: "call-3",
      name: "lookup",
      params: { q: "gamma" },
    });
  });
});
