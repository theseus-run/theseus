import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { CopilotParseError } from "./errors.ts";
import { processSSEChunkToStreamPart, StreamAccumulator } from "./streaming.ts";

describe("copilot streaming parsing", () => {
  test("fails malformed SSE event JSON", async () => {
    const acc = new StreamAccumulator(() => 1);

    await expect(
      Effect.runPromise(processSSEChunkToStreamPart("{", acc, true)),
    ).rejects.toBeInstanceOf(CopilotParseError);
  });

  test("flushes accumulated chat/completions tool calls at finalization", async () => {
    const acc = new StreamAccumulator(() => 1);

    acc.addChatCompletionsDelta({
      tool_calls: [
        {
          index: 0,
          id: "call-1",
          function: { name: "lookup", arguments: '{"q":' },
        },
      ],
    });
    acc.addChatCompletionsDelta({
      tool_calls: [
        {
          index: 0,
          function: { arguments: '"alpha"}' },
        },
      ],
    });

    const parts = await Effect.runPromise(acc.buildFinalParts());

    expect(parts.map((part) => part.type)).toEqual(["tool-call", "finish"]);
    expect(parts[0]).toMatchObject({
      type: "tool-call",
      id: "call-1",
      name: "lookup",
      params: { q: "alpha" },
    });
    expect(parts[1]).toMatchObject({ type: "finish", reason: "tool-calls" });
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
        true,
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
        true,
      ),
    );

    expect(part).toMatchObject({
      type: "tool-call",
      id: "call-2",
      name: "lookup",
      params: { q: "beta" },
    });
  });
});
