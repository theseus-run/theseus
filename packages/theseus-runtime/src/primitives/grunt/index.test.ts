import { describe, expect, test } from "bun:test";
import { Effect, Layer, Ref, Stream } from "effect";
import type { AgentError } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import { LLMError, LLMErrorRetriable, LLMProvider, type LLMResponse } from "../llm/provider.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import { dispatch, dispatchAwait, type GruntEvent } from "./index.ts";

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

const run = (blueprint: Blueprint, task: string, calls: MockCall[]) =>
  Effect.runPromise(
    Effect.provide(dispatchAwait(blueprint, task), makeLLMProvider(calls)),
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
// Existing behavior — all now use dispatchAwait
// ---------------------------------------------------------------------------

describe("dispatchAwait — text-only", () => {
  test("returns content from single text response", async () => {
    const result = await run(blueprint, "hello", [textResp("hi there")]);
    expect(result.content).toBe("hi there");
  });

  test("accumulates usage from single response", async () => {
    const result = await run(blueprint, "hello", [textResp("ok", 20, 8)]);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
  });
});

describe("dispatchAwait — single tool call", () => {
  test("executes tool and accumulates usage across both LLM calls", async () => {
    const result = await run(blueprint, "task", [
      toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"world"}' }], 10, 5),
      textResp("echoed: world", 20, 10),
    ]);
    expect(result.content).toBe("echoed: world");
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });
});

describe("dispatchAwait — parallel tool calls", () => {
  test("executes both tool calls and continues to text", async () => {
    const result = await run(blueprint, "task", [
      toolCallsResp([
        { id: "c1", name: "echo", arguments: '{"msg":"a"}' },
        { id: "c2", name: "echo", arguments: '{"msg":"b"}' },
      ]),
      textResp("done"),
    ]);
    expect(result.content).toBe("done");
  });
});

describe("dispatchAwait — tool errors become strings", () => {
  test("unknown tool — continues without AgentError", async () => {
    const result = await run(blueprint, "task", [
      toolCallsResp([{ id: "c1", name: "nonexistent", arguments: "{}" }]),
      textResp("handled"),
    ]);
    expect(result.content).toBe("handled");
  });

  test("ToolError — continues", async () => {
    const result = await run(blueprint, "task", [
      toolCallsResp([{ id: "c1", name: "fail", arguments: "{}" }]),
      textResp("handled error"),
    ]);
    expect(result.content).toBe("handled error");
  });

  test("invalid JSON args — continues", async () => {
    const result = await run(blueprint, "task", [
      toolCallsResp([{ id: "c1", name: "echo", arguments: "not-json" }]),
      textResp("handled json error"),
    ]);
    expect(result.content).toBe("handled json error");
  });
});

describe("dispatchAwait — cycle cap", () => {
  test("fails with AgentError when maxIterations reached", async () => {
    const cappedBlueprint: Blueprint = { ...blueprint, maxIterations: 1 };
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(cappedBlueprint, "task")),
        makeLLMProvider([
          toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        ]),
      ),
    );
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toContain("Cycle cap exceeded");
  });
});

describe("dispatchAwait — LLMError", () => {
  test("converts permanent LLMError to AgentError", async () => {
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        makeLLMProvider([new LLMError({ message: "bad credentials" })]),
      ),
    );
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toBe("bad credentials");
  });
});

describe("dispatchAwait — LLMErrorRetriable retry", () => {
  test(
    "retries retriable errors and succeeds on third attempt",
    async () => {
      const result = await run(blueprint, "task", [
        new LLMErrorRetriable({ message: "rate limit 1" }),
        new LLMErrorRetriable({ message: "rate limit 2" }),
        textResp("finally done"),
      ]);
      expect(result.content).toBe("finally done");
    },
    10_000,
  );

  test(
    "converts exhausted retriable error to AgentError",
    async () => {
      const err = await Effect.runPromise(
        Effect.provide(
          Effect.flip(dispatchAwait(blueprint, "task")),
          makeLLMProvider([
            new LLMErrorRetriable({ message: "rate limit" }),
            new LLMErrorRetriable({ message: "rate limit" }),
            new LLMErrorRetriable({ message: "rate limit" }),
            new LLMErrorRetriable({ message: "rate limit" }),
          ]),
        ),
      );
      expect(err._tag).toBe("AgentError");
      expect((err as AgentError).cause).toBeInstanceOf(LLMErrorRetriable);
    },
    15_000,
  );
});

// ---------------------------------------------------------------------------
// GruntHandle — events stream
// ---------------------------------------------------------------------------

const collectEvents = (blueprint: Blueprint, task: string, calls: MockCall[]) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const handle = yield* dispatch(blueprint, task);
        const events: GruntEvent[] = [];
        yield* Stream.tap(handle.events, (e) =>
          Effect.sync(() => { events.push(e); }),
        ).pipe(Stream.runDrain);
        return events;
      }),
      makeLLMProvider(calls),
    ),
  );

describe("GruntHandle — events stream", () => {
  test("text-only: emits Thinking then Done", async () => {
    const events = await collectEvents(blueprint, "task", [textResp("hello")]);
    expect(events.map((e) => e._tag)).toEqual(["Thinking", "Done"]);
    const done = events[1] as Extract<GruntEvent, { _tag: "Done" }>;
    expect(done.result.content).toBe("hello");
  });

  test("tool call: emits ToolCalling before ToolResult", async () => {
    const events = await collectEvents(blueprint, "task", [
      toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
      textResp("done"),
    ]);
    const tags = events.map((e) => e._tag);
    expect(tags).toEqual(["Thinking", "ToolCalling", "ToolResult", "Thinking", "Done"]);
  });

  test("parallel tool calls: both ToolCalling events emitted before any ToolResult", async () => {
    const events = await collectEvents(blueprint, "task", [
      toolCallsResp([
        { id: "c1", name: "echo", arguments: '{"msg":"a"}' },
        { id: "c2", name: "echo", arguments: '{"msg":"b"}' },
      ]),
      textResp("done"),
    ]);
    const tags = events.map((e) => e._tag);
    // Both ToolCallings come before any ToolResult
    const firstResult = tags.indexOf("ToolResult");
    const lastCalling = tags.lastIndexOf("ToolCalling");
    expect(lastCalling).toBeLessThan(firstResult);
  });

  test("Done event carries AgentResult", async () => {
    const events = await collectEvents(blueprint, "task", [textResp("result text", 5, 3)]);
    const done = events.find((e) => e._tag === "Done") as Extract<GruntEvent, { _tag: "Done" }>;
    expect(done.result.content).toBe("result text");
    expect(done.result.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
  });

  test("agent name on all events", async () => {
    const events = await collectEvents(blueprint, "task", [textResp("hi")]);
    for (const e of events) {
      expect((e as { agent: string }).agent).toBe("test-grunt");
    }
  });
});

// ---------------------------------------------------------------------------
// GruntHandle — preemptive interrupt
// ---------------------------------------------------------------------------

describe("GruntHandle — interrupt", () => {
  test("cancels mid-flight LLM call, result fails with AgentError", async () => {
    const neverProvider = Layer.succeed(LLMProvider)(
      LLMProvider.of({ call: () => Effect.never }),
    );

    const handle = await Effect.runPromise(
      Effect.provide(dispatch(blueprint, "task"), neverProvider),
    );

    await Effect.runPromise(handle.interrupt);

    const err = await Effect.runPromise(Effect.flip(handle.result));
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toBe("Interrupted");
  });

  test("events stream terminates after interrupt", async () => {
    const neverProvider = Layer.succeed(LLMProvider)(
      LLMProvider.of({ call: () => Effect.never }),
    );

    const handle = await Effect.runPromise(
      Effect.provide(dispatch(blueprint, "task"), neverProvider),
    );

    const eventsP = Effect.runPromise(Stream.runCollect(handle.events));
    await Effect.runPromise(handle.interrupt);
    const events = await eventsP;
    // stream terminated (may have 0 or 1 Thinking events depending on fiber scheduling)
    expect(Array.from(events).every((e) => e._tag !== "Done")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GruntHandle — inject
// ---------------------------------------------------------------------------

describe("GruntHandle — inject", () => {
  test("inject AppendMessages: messages appear in subsequent LLM call", async () => {
    let secondCallMessageCount = 0;

    const countingProvider = Layer.effect(LLMProvider)(
      Effect.gen(function* () {
        const ref = yield* Ref.make(0);
        return LLMProvider.of({
          call: (messages) =>
            Effect.gen(function* () {
              const i = yield* Ref.getAndUpdate(ref, (n) => n + 1);
              if (i === 0) {
                // First call: return tool_calls to force a second iteration
                return toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]);
              }
              secondCallMessageCount = messages.length;
              return textResp("done");
            }),
        });
      }),
    );

    const handle = await Effect.runPromise(
      Effect.provide(dispatch(blueprint, "task"), countingProvider),
    );

    // Inject before the loop fiber processes iteration 1
    await Effect.runPromise(
      handle.inject({
        _tag: "AppendMessages",
        messages: [{ role: "user", content: "extra" }],
      }),
    );

    await Effect.runPromise(handle.result);

    // Without inject: [system, user, assistant(tool_calls), tool_result] = 4
    // With inject:   4 + 1 injected = 5
    expect(secondCallMessageCount).toBe(5);
  });

  test("inject Interrupt: result fails with AgentError at next iteration boundary", async () => {
    const handle = await Effect.runPromise(
      Effect.provide(
        dispatch(blueprint, "task"),
        makeLLMProvider([
          toolCallsResp([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        ]),
      ),
    );

    await Effect.runPromise(handle.inject({ _tag: "Interrupt" }));

    const err = await Effect.runPromise(Effect.flip(handle.result));
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toContain("Interrupted");
  });
});
