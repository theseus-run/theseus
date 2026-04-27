import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import * as AiTool from "effect/unstable/ai/Tool";
import { aiToolsToResponsesTools, promptToResponsesInput } from "./prompt.ts";

describe("openai prompt encoding", () => {
  test("encodes text, assistant tool calls, and tool results for responses", async () => {
    const prompt = {
      content: [
        { role: "system", content: "system" },
        { role: "user", content: [{ type: "text", text: "question" }] },
        {
          role: "assistant",
          content: [
            { type: "text", text: "using tool" },
            { type: "tool-call", id: "call-1", name: "lookup", params: { q: "alpha" } },
          ],
        },
        {
          role: "tool",
          content: [{ type: "tool-result", id: "call-1", result: { value: 1 } }],
        },
      ],
    } as unknown as Prompt.Prompt;

    const encoded = await Effect.runPromise(promptToResponsesInput(prompt));

    expect(encoded).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "question" },
      { role: "assistant", content: "using tool" },
      {
        type: "function_call",
        call_id: "call-1",
        name: "lookup",
        arguments: JSON.stringify({ q: "alpha" }),
      },
      {
        type: "function_call_output",
        call_id: "call-1",
        output: JSON.stringify({ value: 1 }),
      },
    ]);
  });

  test("converts Effect AI tools to OpenAI function tools", () => {
    const lookup = AiTool.make("lookup", {
      description: "Look up a value.",
      parameters: Schema.Struct({ q: Schema.String }),
      success: Schema.String,
    });

    expect(aiToolsToResponsesTools([lookup])).toEqual([
      {
        type: "function",
        name: "lookup",
        description: "Look up a value.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["q"],
          properties: { q: { type: "string" } },
        },
      },
    ]);
  });
});
