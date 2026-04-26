import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { CopilotParseError } from "./errors.ts";
import {
  parseChatCompletionsToResponseParts,
  parseResponsesResponseToResponseParts,
} from "./response-parser.ts";

describe("copilot response parsing", () => {
  test("extracts chat/completions text, tool calls, and usage", async () => {
    const parts = await Effect.runPromise(
      parseChatCompletionsToResponseParts({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "using a tool",
              tool_calls: [
                {
                  id: "call-1",
                  function: { name: "lookup", arguments: JSON.stringify({ q: "alpha" }) },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    );

    expect(parts.map((part) => part.type)).toEqual(["text", "tool-call", "finish"]);
    expect(parts[1]).toMatchObject({
      type: "tool-call",
      id: "call-1",
      name: "lookup",
      params: { q: "alpha" },
    });
    expect(parts[2]).toMatchObject({
      type: "finish",
      reason: "tool-calls",
      usage: { inputTokens: { total: 12 }, outputTokens: { total: 4 } },
    });
  });

  test("fails malformed chat tool arguments as a parse error", async () => {
    await expect(
      Effect.runPromise(
        parseChatCompletionsToResponseParts({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                tool_calls: [
                  {
                    id: "call-1",
                    function: { name: "lookup", arguments: "{" },
                  },
                ],
              },
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(CopilotParseError);
  });

  test("extracts responses text, reasoning, tool calls, and usage", async () => {
    const parts = await Effect.runPromise(
      parseResponsesResponseToResponseParts({
        output: [
          {
            type: "reasoning",
            content: [{ type: "reasoning_text", text: "thinking" }],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: "answer" }],
          },
          {
            type: "function_call",
            call_id: "call-2",
            name: "lookup",
            arguments: JSON.stringify({ q: "beta" }),
          },
        ],
        usage: { input_tokens: 21, output_tokens: 7 },
      }),
    );

    expect(parts.map((part) => part.type)).toEqual(["reasoning", "text", "tool-call", "finish"]);
    expect(parts[2]).toMatchObject({
      type: "tool-call",
      id: "call-2",
      name: "lookup",
      params: { q: "beta" },
    });
    expect(parts[3]).toMatchObject({
      type: "finish",
      reason: "tool-calls",
      usage: { inputTokens: { total: 21 }, outputTokens: { total: 7 } },
    });
  });

  test("fails malformed responses tool arguments as a parse error", async () => {
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
    ).rejects.toBeInstanceOf(CopilotParseError);
  });
});
