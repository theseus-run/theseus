import { describe, expect, test } from "bun:test";
import { Effect, Layer, Ref } from "effect";
import type { AgentError } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import { LLMError, LLMErrorRetriable, LLMProvider, type LLMResponse } from "../llm/provider.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import { dispatch } from "./index.ts";

// ---------------------------------------------------------------------------
// Mock LLM provider
// ---------------------------------------------------------------------------

type MockCall = LLMResponse | LLMError | LLMErrorRetriable;

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
            if (r instanceof LLMError || r instanceof LLMErrorRetriable) {
              return yield* Effect.fail(r);
            }
            return r;
          }),
      });
    }),
  );

const run = <A, E>(effect: Effect.Effect<A, E, LLMProvider>, calls: MockCall[]) =>
  Effect.runPromise(Effect.provide(effect, makeLLMProvider(calls)));

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

const failingTool = defineTool<object, string>({
  name: "fail",
  description: "Always fails with ToolError",
  inputSchema: manualSchema({ type: "object", properties: {}, required: [] }, (r) => r as object),
  safety: "readonly",
  capabilities: [],
  execute: (_input, { fail }) => Effect.fail(fail("tool blew up")),
  encode: () => "unreachable",
});

const blueprint: Blueprint = {
  name: "test-grunt",
  systemPrompt: "You are a test agent.",
  tools: [echoTool, failingTool],
};

// ---------------------------------------------------------------------------
// 1. Text-only — single text response
// ---------------------------------------------------------------------------

describe("dispatch — text-only", () => {
  test("returns content from single text response", async () => {
    const result = await run(dispatch(blueprint, "hello"), [textResp("hi there")]);
    expect(result.content).toBe("hi there");
  });

  test("accumulates usage from single response", async () => {
    const result = await run(dispatch(blueprint, "hello"), [textResp("ok", 20, 8)]);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
  });
});

// ---------------------------------------------------------------------------
// 2. Single tool call → execute → text
// ---------------------------------------------------------------------------

describe("dispatch — single tool call", () => {
  test("executes tool and accumulates usage across both LLM calls", async () => {
    const result = await run(dispatch(blueprint, "task"), [
      toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"world"}' }], 10, 5),
      textResp("echoed: world", 20, 10),
    ]);
    expect(result.content).toBe("echoed: world");
    // usage is accumulated: (10+20, 5+10)
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });
});

// ---------------------------------------------------------------------------
// 3. Parallel tool calls — two in one turn
// ---------------------------------------------------------------------------

describe("dispatch — parallel tool calls", () => {
  test("executes both tool calls and continues to text", async () => {
    const result = await run(dispatch(blueprint, "task"), [
      toolCallsResp([
        { id: "c1", name: "echo", arguments: '{"msg":"a"}' },
        { id: "c2", name: "echo", arguments: '{"msg":"b"}' },
      ]),
      textResp("done"),
    ]);
    expect(result.content).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// 4. Unknown tool → error string fed to LLM, loop continues
// ---------------------------------------------------------------------------

describe("dispatch — unknown tool", () => {
  test("feeds error string to LLM and continues without AgentError", async () => {
    const result = await run(dispatch(blueprint, "task"), [
      toolCallsResp([{ id: "c1", name: "nonexistent", arguments: "{}" }]),
      textResp("handled"),
    ]);
    expect(result.content).toBe("handled");
  });
});

// ---------------------------------------------------------------------------
// 5. Tool error → ToolError string → LLM continues
// ---------------------------------------------------------------------------

describe("dispatch — tool error", () => {
  test("converts ToolError to error string and continues", async () => {
    const result = await run(dispatch(blueprint, "task"), [
      toolCallsResp([{ id: "c1", name: "fail", arguments: "{}" }]),
      textResp("handled error"),
    ]);
    expect(result.content).toBe("handled error");
  });

  test("converts invalid JSON args to error string and continues", async () => {
    const result = await run(dispatch(blueprint, "task"), [
      toolCallsResp([{ id: "c1", name: "echo", arguments: "not-json" }]),
      textResp("handled json error"),
    ]);
    expect(result.content).toBe("handled json error");
  });
});

// ---------------------------------------------------------------------------
// 6. Cycle cap exceeded
// ---------------------------------------------------------------------------

describe("dispatch — cycle cap", () => {
  test("fails with AgentError when maxIterations reached", async () => {
    const cappedBlueprint: Blueprint = { ...blueprint, maxIterations: 1 };
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatch(cappedBlueprint, "task")),
        makeLLMProvider([
          toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        ]),
      ),
    );
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).agent).toBe("test-grunt");
    expect((err as AgentError).message).toContain("Cycle cap exceeded");
    expect((err as AgentError).message).toContain("1");
  });
});

// ---------------------------------------------------------------------------
// 7. LLMError → AgentError (permanent, no retry)
// ---------------------------------------------------------------------------

describe("dispatch — LLMError", () => {
  test("converts permanent LLMError to AgentError", async () => {
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatch(blueprint, "task")),
        makeLLMProvider([new LLMError({ message: "bad credentials" })]),
      ),
    );
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toBe("bad credentials");
    expect((err as AgentError).agent).toBe("test-grunt");
  });
});

// ---------------------------------------------------------------------------
// 8. LLMErrorRetriable retry — fails twice, third succeeds
// Timing note: uses DEFAULT_LLM_RETRY_SCHEDULE (500ms exponential jittered)
// ---------------------------------------------------------------------------

describe("dispatch — LLMErrorRetriable retry", () => {
  test(
    "retries retriable errors and succeeds on third attempt",
    async () => {
      const result = await run(dispatch(blueprint, "task"), [
        new LLMErrorRetriable({ message: "rate limit 1" }),
        new LLMErrorRetriable({ message: "rate limit 2" }),
        textResp("finally done"),
      ]);
      expect(result.content).toBe("finally done");
    },
    10_000,
  );
});

// ---------------------------------------------------------------------------
// 9. LLMErrorRetriable exhausted → AgentError
// Timing note: Schedule.recurs(3) = 4 total attempts, ~3.5s wait
// ---------------------------------------------------------------------------

describe("dispatch — LLMErrorRetriable exhausted", () => {
  test(
    "converts exhausted retriable error to AgentError",
    async () => {
      const err = await Effect.runPromise(
        Effect.provide(
          Effect.flip(dispatch(blueprint, "task")),
          makeLLMProvider([
            new LLMErrorRetriable({ message: "rate limit" }),
            new LLMErrorRetriable({ message: "rate limit" }),
            new LLMErrorRetriable({ message: "rate limit" }),
            new LLMErrorRetriable({ message: "rate limit" }),
          ]),
        ),
      );
      expect(err._tag).toBe("AgentError");
      expect((err as AgentError).message).toBe("rate limit");
      expect((err as AgentError).cause).toBeInstanceOf(LLMErrorRetriable);
    },
    15_000,
  );
});
