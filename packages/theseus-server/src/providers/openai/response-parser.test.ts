import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { OpenAIParseError } from "./errors.ts";
import { parseResponsesResponseToResponseParts } from "./response-parser.ts";

describe("openai response parsing", () => {
  test("extracts responses text and usage", async () => {
    const parts = await Effect.runPromise(
      parseResponsesResponseToResponseParts({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "answer" }],
          },
        ],
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
    );

    expect(parts.map((part) => part.type)).toEqual(["text", "finish"]);
    expect(parts[0]).toMatchObject({ type: "text", text: "answer" });
    expect(parts[1]).toMatchObject({
      type: "finish",
      reason: "stop",
      usage: { inputTokens: { total: 12 }, outputTokens: { total: 4 } },
    });
  });

  test("extracts responses function calls", async () => {
    const parts = await Effect.runPromise(
      parseResponsesResponseToResponseParts({
        output: [
          {
            type: "function_call",
            call_id: "call-1",
            name: "lookup",
            arguments: JSON.stringify({ q: "alpha" }),
          },
        ],
      }),
    );

    expect(parts.map((part) => part.type)).toEqual(["tool-call", "finish"]);
    expect(parts[0]).toMatchObject({
      type: "tool-call",
      id: "call-1",
      name: "lookup",
      params: { q: "alpha" },
    });
    expect(parts[1]).toMatchObject({ type: "finish", reason: "tool-calls" });
  });

  test("fails malformed tool arguments as a parse error", async () => {
    await expect(
      Effect.runPromise(
        parseResponsesResponseToResponseParts({
          output: [
            {
              type: "function_call",
              call_id: "call-1",
              name: "lookup",
              arguments: "{",
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(OpenAIParseError);
  });
});
