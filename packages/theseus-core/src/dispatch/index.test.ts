import { describe, expect, test } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as AiError from "effect/unstable/ai/AiError";
import type { AgentError } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import {
  makeMockLanguageModel, textParts, toolCallParts,
  type MockResponse,
} from "../test-utils/mock-language-model.ts";
import {
  dispatch, dispatchAwait, runToolCall, runToolCalls,
  step, tryParseArgs, type DispatchEvent,
} from "./index.ts";
import { extractToolDefs } from "../bridge/to-ai-tools.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = (blueprint: Blueprint, task: string, responses: MockResponse[]) =>
  Effect.runPromise(
    Effect.provide(dispatchAwait(blueprint, task), makeMockLanguageModel(responses)),
  );

const collectEvents = (blueprint: Blueprint, task: string, responses: MockResponse[]) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const handle = yield* dispatch(blueprint, task);
        const events: DispatchEvent[] = [];
        yield* Stream.tap(handle.events, (e) =>
          Effect.sync(() => { events.push(e); }),
        ).pipe(Stream.runDrain);
        return events;
      }),
      makeMockLanguageModel(responses),
    ),
  );

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

// ===========================================================================
// step — pure LLM call (no tool execution)
// ===========================================================================

describe("step — text response", () => {
  test("returns StepText with content and usage", async () => {
    const messages = [
      { role: "system" as const, content: "system" },
      { role: "user" as const, content: "hello" },
    ];
    const result = await Effect.runPromise(
      Effect.provide(
        step(messages, [], "test-agent"),
        makeMockLanguageModel([textParts("hi", 10, 5)]),
      ),
    );
    expect(result._tag).toBe("text");
    if (result._tag === "text") {
      expect(result.content).toBe("hi");
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    }
  });
});

describe("step — tool_calls response", () => {
  test("returns raw toolCalls without executing them", async () => {
    const messages = [
      { role: "system" as const, content: "system" },
      { role: "user" as const, content: "task" },
    ];
    const result = await Effect.runPromise(
      Effect.provide(
        step(messages, [echoTool], "test-agent"),
        makeMockLanguageModel([
          toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"world"}' }]),
        ]),
      ),
    );
    expect(result._tag).toBe("tool_calls");
    if (result._tag === "tool_calls") {
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]!.name).toBe("echo");
      expect(result.toolCalls[0]!.arguments).toBe('{"msg":"world"}');
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    }
  });
});

describe("step — errors", () => {
  test("converts AiError to AgentError", async () => {
    const messages = [{ role: "user" as const, content: "task" }];
    const aiErr = AiError.make({
      module: "MockLLM",
      method: "generateText",
      reason: new AiError.AuthenticationError({ kind: "InvalidKey" }),
    });
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(step(messages, [], "test-agent")),
        makeMockLanguageModel([aiErr]),
      ),
    );
    expect(err._tag).toBe("AgentError");
  });
});

describe("step — returns own usage only", () => {
  test("usage reflects only this call, not accumulated", async () => {
    const messages = [{ role: "user" as const, content: "task" }];
    const result = await Effect.runPromise(
      Effect.provide(
        step(messages, [], "test-agent"),
        makeMockLanguageModel([textParts("ok", 10, 5)]),
      ),
    );
    if (result._tag === "text") {
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    }
  });
});

// ===========================================================================
// runToolCall / runToolCalls — tool execution helpers
// ===========================================================================

describe("runToolCall", () => {
  test("unknown tool returns error string", async () => {
    const tc = { id: "c1", name: "nope", arguments: "{}" };
    const result = await Effect.runPromise(runToolCall([], tc));
    expect(result.content).toContain("unknown tool");
  });

  test("invalid JSON returns error string", async () => {
    const tc = { id: "c1", name: "echo", arguments: "bad" };
    const result = await Effect.runPromise(runToolCall([echoTool], tc));
    expect(result.content).toContain("invalid JSON");
  });

  test("ToolError returns error string", async () => {
    const tc = { id: "c1", name: "fail", arguments: "{}" };
    const result = await Effect.runPromise(runToolCall([failingTool], tc));
    expect(result.content).toContain("tool blew up");
  });

  test("success returns tool output with parsed args", async () => {
    const tc = { id: "c1", name: "echo", arguments: '{"msg":"hi"}' };
    const result = await Effect.runPromise(runToolCall([echoTool], tc));
    expect(result.content).toBe("hi");
    expect(result.args).toEqual({ msg: "hi" });
  });
});

describe("runToolCalls", () => {
  test("executes multiple tool calls in parallel", async () => {
    const tcs = [
      { id: "c1", name: "echo", arguments: '{"msg":"a"}' },
      { id: "c2", name: "echo", arguments: '{"msg":"b"}' },
    ];
    const results = await Effect.runPromise(runToolCalls([echoTool], tcs));
    expect(results).toHaveLength(2);
    expect(results[0]!.content).toBe("a");
    expect(results[1]!.content).toBe("b");
  });
});

// ===========================================================================
// extractToolDefs / tryParseArgs
// ===========================================================================

describe("extractToolDefs", () => {
  test("extracts name, description, inputSchema from tools", () => {
    const defs = extractToolDefs([echoTool, failingTool]);
    expect(defs).toHaveLength(2);
    expect(defs[0]!.name).toBe("echo");
    expect(defs[0]!.description).toBe("Echo a message");
    expect(defs[0]!.inputSchema).toEqual({
      type: "object",
      properties: { msg: { type: "string" } },
      required: ["msg"],
    });
    expect(defs[1]!.name).toBe("fail");
  });
});

describe("tryParseArgs", () => {
  test("parses valid JSON", () => {
    const result = tryParseArgs({ id: "c1", name: "t", arguments: '{"a":1}' });
    expect(result).toEqual({ a: 1 });
  });

  test("returns raw string for invalid JSON", () => {
    const result = tryParseArgs({ id: "c1", name: "t", arguments: "not-json" });
    expect(result).toBe("not-json");
  });
});

// ===========================================================================
// dispatchAwait
// ===========================================================================

describe("dispatchAwait — text-only", () => {
  test("returns content from single text response", async () => {
    const result = await run(blueprint, "hello", [textParts("hi there")]);
    expect(result.content).toBe("hi there");
  });

  test("accumulates usage from single response", async () => {
    const result = await run(blueprint, "hello", [textParts("ok", 20, 8)]);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
  });
});

describe("dispatchAwait — single tool call", () => {
  test("executes tool and accumulates usage across both LLM calls", async () => {
    const result = await run(blueprint, "task", [
      toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"world"}' }], 10, 5),
      textParts("echoed: world", 20, 10),
    ]);
    expect(result.content).toBe("echoed: world");
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });
});

describe("dispatchAwait — parallel tool calls", () => {
  test("executes both tool calls and continues to text", async () => {
    const result = await run(blueprint, "task", [
      toolCallParts([
        { id: "c1", name: "echo", arguments: '{"msg":"a"}' },
        { id: "c2", name: "echo", arguments: '{"msg":"b"}' },
      ]),
      textParts("done"),
    ]);
    expect(result.content).toBe("done");
  });
});

describe("dispatchAwait — tool errors become strings", () => {
  test("unknown tool — LanguageModel rejects unknown tool names as AiError, dispatch converts to AgentError", async () => {
    // With @effect/ai, the framework validates tool names against the toolkit.
    // A tool name not in the toolkit becomes an InvalidOutputError → AgentError.
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        makeMockLanguageModel([
          toolCallParts([{ id: "c1", name: "nonexistent", arguments: "{}" }]),
        ]),
      ),
    );
    expect(err._tag).toBe("AgentError");
  });

  test("ToolError — continues", async () => {
    const result = await run(blueprint, "task", [
      toolCallParts([{ id: "c1", name: "fail", arguments: "{}" }]),
      textParts("handled error"),
    ]);
    expect(result.content).toBe("handled error");
  });

  test("invalid JSON args — continues", async () => {
    const result = await run(blueprint, "task", [
      toolCallParts([{ id: "c1", name: "echo", arguments: "not-json" }]),
      textParts("handled json error"),
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
        makeMockLanguageModel([
          toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        ]),
      ),
    );
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toContain("Cycle cap exceeded");
  });
});

describe("dispatchAwait — AiError", () => {
  test("converts AiError to AgentError", async () => {
    const aiErr = AiError.make({
      module: "MockLLM",
      method: "generateText",
      reason: new AiError.AuthenticationError({ kind: "InvalidKey" }),
    });
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        makeMockLanguageModel([aiErr]),
      ),
    );
    expect(err._tag).toBe("AgentError");
  });
});

// ---------------------------------------------------------------------------
// DispatchHandle — events stream
// ---------------------------------------------------------------------------

describe("DispatchHandle — events stream", () => {
  test("text-only: emits Calling, TextDelta(s), then Done", async () => {
    const events = await collectEvents(blueprint, "task", [textParts("hello")]);
    const tags = events.map((e) => e._tag);
    expect(tags[0]).toBe("Calling");
    expect(tags[tags.length - 1]).toBe("Done");
    // Streaming produces TextDelta events between Calling and Done
    expect(tags.filter((t) => t === "TextDelta").length).toBeGreaterThanOrEqual(1);
    const done = events.find((e): e is Extract<DispatchEvent, { _tag: "Done" }> => e._tag === "Done");
    expect(done!.result.content).toBe("hello");
  });

  test("tool call: emits ToolCalling before ToolResult", async () => {
    const events = await collectEvents(blueprint, "task", [
      toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
      textParts("done"),
    ]);
    const tags = events.map((e) => e._tag);
    // Streaming adds TextDelta events; core ordering preserved
    expect(tags.indexOf("ToolCalling")).toBeLessThan(tags.indexOf("ToolResult"));
    expect(tags.filter((t) => t === "Calling").length).toBe(2);
    expect(tags[tags.length - 1]).toBe("Done");
  });

  test("parallel tool calls: both ToolCalling events emitted before any ToolResult", async () => {
    const events = await collectEvents(blueprint, "task", [
      toolCallParts([
        { id: "c1", name: "echo", arguments: '{"msg":"a"}' },
        { id: "c2", name: "echo", arguments: '{"msg":"b"}' },
      ]),
      textParts("done"),
    ]);
    const tags = events.map((e) => e._tag);
    const firstResult = tags.indexOf("ToolResult");
    const lastCalling = tags.lastIndexOf("ToolCalling");
    expect(lastCalling).toBeLessThan(firstResult);
  });

  test("Done event carries AgentResult", async () => {
    const events = await collectEvents(blueprint, "task", [textParts("result text", 5, 3)]);
    const done = events.find((e): e is Extract<DispatchEvent, { _tag: "Done" }> => e._tag === "Done");
    expect(done).toBeDefined();
    expect(done!.result.content).toBe("result text");
    expect(done!.result.usage).toEqual({ inputTokens: 5, outputTokens: 3 });
  });

  test("agent name on all events", async () => {
    const events = await collectEvents(blueprint, "task", [textParts("hi")]);
    events.forEach((e) => {
      expect((e as { agent: string }).agent).toBe("test-grunt");
    });
  });
});

// ---------------------------------------------------------------------------
// DispatchHandle — preemptive interrupt
// ---------------------------------------------------------------------------

describe("DispatchHandle — interrupt", () => {
  test("cancels mid-flight LLM call, result fails with AgentError", async () => {
    const neverProvider = Layer.effect(LanguageModel.LanguageModel)(
      Effect.gen(function* () {
        return yield* LanguageModel.make({
          generateText: () => Effect.never,
          streamText: () => Stream.never,
        });
      }),
    );

    const handle = await Effect.runPromise(
      Effect.provide(dispatch(blueprint, "task"), neverProvider),
    );

    await Effect.runPromise(handle.interrupt);

    const err = await Effect.runPromise(Effect.flip(handle.result));
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toBe("Interrupted");
  });
});

// ---------------------------------------------------------------------------
// DispatchHandle — inject
// ---------------------------------------------------------------------------

describe("DispatchHandle — inject", () => {
  test("inject Interrupt: result fails with AgentError at next iteration boundary", async () => {
    const handle = await Effect.runPromise(
      Effect.provide(
        dispatch(blueprint, "task"),
        makeMockLanguageModel([
          toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        ]),
      ),
    );

    await Effect.runPromise(handle.inject({ _tag: "Interrupt" }));

    const err = await Effect.runPromise(Effect.flip(handle.result));
    expect(err._tag).toBe("AgentError");
    expect((err as AgentError).message).toContain("Interrupted");
  });
});
