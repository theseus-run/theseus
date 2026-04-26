import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { promptToChatCompletions, promptToResponsesInput } from "./prompt.ts";

describe("copilot prompt encoding", () => {
  test("encodes text, assistant tool calls, and tool results for chat/completions", async () => {
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

    const encoded = await Effect.runPromise(promptToChatCompletions(prompt));

    expect(encoded).toEqual([
      { role: "system", content: "system" },
      { role: "user", content: "question" },
      {
        role: "assistant",
        content: "using tool",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "lookup", arguments: JSON.stringify({ q: "alpha" }) },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call-1",
        content: JSON.stringify({ value: 1 }),
      },
    ]);
  });

  test("encodes responses input with function call items and outputs", async () => {
    const prompt = {
      content: [
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
          content: [{ type: "tool-result", id: "call-1", result: "done" }],
        },
      ],
    } as unknown as Prompt.Prompt;

    const encoded = await Effect.runPromise(promptToResponsesInput(prompt));

    expect(encoded).toEqual([
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
        output: "done",
      },
    ]);
  });
});
