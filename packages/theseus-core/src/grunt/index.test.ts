import { describe, expect, test } from "bun:test";
import { Effect, Layer, Ref, Stream } from "effect";
import type { AgentError, Blueprint } from "../agent/index.ts";
import { LLMError, LLMProvider, type LLMResponse } from "../llm/provider.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import type { DispatchEvent } from "../dispatch/index.ts";
import { grunt, gruntAwait } from "./index.ts";

// ---------------------------------------------------------------------------
// Mock LLM provider (same pattern as dispatch tests)
// ---------------------------------------------------------------------------

type MockCall = LLMResponse | LLMError;

const makeLLMProvider = (calls: MockCall[]): Layer.Layer<LLMProvider> =>
  Layer.effect(LLMProvider)(
    Effect.gen(function* () {
      const ref = yield* Ref.make(0);
      return LLMProvider.of({
        call: () =>
          Effect.gen(function* () {
            const i = yield* Ref.getAndUpdate(ref, (n) => n + 1);
            const r = calls[i];
            if (!r) return yield* Effect.fail(new LLMError({ message: "unexpected call" }));
            if (r instanceof LLMError) return yield* Effect.fail(r);
            return r;
          }),
      });
    }),
  );

const textResp = (content: string, inputTokens = 10, outputTokens = 5): LLMResponse => ({
  type: "text",
  content,
  usage: { inputTokens, outputTokens },
});

const toolCallsResp = (
  calls: Array<{ id: string; name: string; arguments: string }>,
  inputTokens = 10,
  outputTokens = 5,
): LLMResponse => ({
  type: "tool_calls",
  toolCalls: calls,
  usage: { inputTokens, outputTokens },
});

// ---------------------------------------------------------------------------
// Test tools
// ---------------------------------------------------------------------------

const echoTool = defineTool({
  name: "echo",
  description: "Echo a message",
  inputSchema: manualSchema(
    { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] },
    (raw) => {
      const r = raw as { msg?: unknown };
      if (typeof r.msg !== "string") throw new Error("msg must be a string");
      return r as { msg: string };
    },
  ),
  safety: "readonly",
  capabilities: [],
  execute: ({ msg }) => Effect.succeed(msg),
  encode: (s) => s,
});

const blueprint: Blueprint = {
  name: "test-grunt",
  systemPrompt: "You are a test agent.",
  tools: [echoTool],
};

// ===========================================================================
// gruntAwait — fire-and-forget, result only
// ===========================================================================

describe("gruntAwait — text-only", () => {
  test("returns content from single text response", async () => {
    const result = await Effect.runPromise(
      Effect.provide(gruntAwait(blueprint, "hello"), makeLLMProvider([textResp("hi there")])),
    );
    expect(result.content).toBe("hi there");
  });

  test("accumulates usage", async () => {
    const result = await Effect.runPromise(
      Effect.provide(gruntAwait(blueprint, "hello"), makeLLMProvider([textResp("ok", 20, 8)])),
    );
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
  });
});

describe("gruntAwait — tool call loop", () => {
  test("executes tool and returns final text", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        gruntAwait(blueprint, "task"),
        makeLLMProvider([
          toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"world"}' }]),
          textResp("echoed: world", 20, 10),
        ]),
      ),
    );
    expect(result.content).toBe("echoed: world");
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });
});

describe("gruntAwait — error", () => {
  test("converts LLMError to AgentError", async () => {
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(gruntAwait(blueprint, "task")),
        makeLLMProvider([new LLMError({ message: "bad credentials" })]),
      ),
    );
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toBe("bad credentials");
  });
});

// ===========================================================================
// grunt — handle with events stream
// ===========================================================================

describe("grunt — events stream", () => {
  test("emits Thinking then Done for text-only", async () => {
    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const handle = yield* grunt(blueprint, "task");
          const collected: DispatchEvent[] = [];
          yield* Stream.tap(handle.events, (e) =>
            Effect.sync(() => { collected.push(e); }),
          ).pipe(Stream.runDrain);
          return collected;
        }),
        makeLLMProvider([textResp("hello")]),
      ),
    );
    expect(events.map((e) => e._tag)).toEqual(["Calling", "Done"]);
  });

  test("emits tool events for tool call loop", async () => {
    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const handle = yield* grunt(blueprint, "task");
          const collected: DispatchEvent[] = [];
          yield* Stream.tap(handle.events, (e) =>
            Effect.sync(() => { collected.push(e); }),
          ).pipe(Stream.runDrain);
          return collected;
        }),
        makeLLMProvider([
          toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
          textResp("done"),
        ]),
      ),
    );
    expect(events.map((e) => e._tag)).toEqual([
      "Calling", "ToolCalling", "ToolResult", "Calling", "Done",
    ]);
  });
});

describe("grunt — handle has no inject/interrupt", () => {
  test("GruntHandle only exposes events and result", async () => {
    const handle = await Effect.runPromise(
      Effect.provide(grunt(blueprint, "task"), makeLLMProvider([textResp("hi")])),
    );
    expect(handle).toHaveProperty("events");
    expect(handle).toHaveProperty("result");
    expect(handle).not.toHaveProperty("inject");
    expect(handle).not.toHaveProperty("interrupt");
  });
});
