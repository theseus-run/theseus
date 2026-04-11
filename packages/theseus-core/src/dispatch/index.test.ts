import { describe, expect, test } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as AiError from "effect/unstable/ai/AiError";
import type { AgentCycleExceeded, AgentInterrupted } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import {
  makeMockLanguageModel, textParts, toolCallParts,
  type MockResponse,
} from "../test-utils/mock-language-model.ts";
import {
  dispatch, dispatchAwait, runToolCall,
  step, tryParseArgs, type DispatchEvent,
} from "./index.ts";
import { DefaultSatelliteRing } from "../satellite/ring.ts";
import { NoopDispatchLog, InMemoryDispatchLog, DispatchLog } from "./log.ts";
import { extractToolDefs } from "../bridge/to-ai-tools.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = (blueprint: Blueprint, task: string, responses: MockResponse[]) =>
  Effect.runPromise(
    Effect.provide(
      dispatchAwait(blueprint, task),
      Layer.merge(Layer.merge(makeMockLanguageModel(responses), DefaultSatelliteRing), NoopDispatchLog),
    ),
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
      Layer.merge(Layer.merge(makeMockLanguageModel(responses), DefaultSatelliteRing), NoopDispatchLog),
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
  test("converts AiError to AgentLLMError", async () => {
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
    expect(err._tag).toBe("AgentLLMError");
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
  test("unknown tool fails with ToolCallUnknown", async () => {
    const tc = { id: "c1", name: "nope", arguments: "{}" };
    const err = await Effect.runPromise(Effect.flip(runToolCall([], tc)));
    expect(err._tag).toBe("ToolCallUnknown");
    expect((err as any).name).toBe("nope");
  });

  test("invalid JSON fails with ToolCallBadArgs", async () => {
    const tc = { id: "c1", name: "echo", arguments: "bad" };
    const err = await Effect.runPromise(Effect.flip(runToolCall([echoTool], tc)));
    expect(err._tag).toBe("ToolCallBadArgs");
  });

  test("ToolError fails with ToolCallFailed", async () => {
    const tc = { id: "c1", name: "fail", arguments: "{}" };
    const err = await Effect.runPromise(Effect.flip(runToolCall([failingTool], tc)));
    expect(err._tag).toBe("ToolCallFailed");
    expect((err as any).cause._tag).toBe("ToolError");
  });

  test("success returns tool output with parsed args", async () => {
    const tc = { id: "c1", name: "echo", arguments: '{"msg":"hi"}' };
    const result = await Effect.runPromise(runToolCall([echoTool], tc));
    expect(result.content).toBe("hi");
    expect(result.args).toEqual({ msg: "hi" });
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
  test("unknown tool — LanguageModel rejects unknown tool names as AiError, dispatch converts to AgentLLMError", async () => {
    // With @effect/ai, the framework validates tool names against the toolkit.
    // A tool name not in the toolkit becomes an InvalidOutputError → AgentLLMError.
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        Layer.merge(Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "nonexistent", arguments: "{}" }]),
          ]),
          DefaultSatelliteRing,
        ), NoopDispatchLog),
      ),
    );
    expect(err._tag).toBe("AgentLLMError");
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
  test("fails with AgentCycleExceeded when maxIterations reached", async () => {
    const cappedBlueprint: Blueprint = { ...blueprint, maxIterations: 1 };
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(cappedBlueprint, "task")),
        Layer.merge(Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
          ]),
          DefaultSatelliteRing,
        ), NoopDispatchLog),
      ),
    );
    expect(err._tag).toBe("AgentCycleExceeded");
    expect((err as AgentCycleExceeded).max).toBe(1);
  });
});

describe("dispatchAwait — AiError", () => {
  test("converts AiError to AgentLLMError", async () => {
    const aiErr = AiError.make({
      module: "MockLLM",
      method: "generateText",
      reason: new AiError.AuthenticationError({ kind: "InvalidKey" }),
    });
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        Layer.merge(Layer.merge(makeMockLanguageModel([aiErr]), DefaultSatelliteRing), NoopDispatchLog),
      ),
    );
    expect(err._tag).toBe("AgentLLMError");
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
  test("cancels mid-flight LLM call, result fails with AgentInterrupted", async () => {
    const neverProvider = Layer.effect(LanguageModel.LanguageModel)(
      Effect.gen(function* () {
        return yield* LanguageModel.make({
          generateText: () => Effect.never,
          streamText: () => Stream.never,
        });
      }),
    );

    const handle = await Effect.runPromise(
      Effect.provide(dispatch(blueprint, "task"), Layer.merge(Layer.merge(neverProvider, DefaultSatelliteRing), NoopDispatchLog)),
    );

    await Effect.runPromise(handle.interrupt);

    const err = await Effect.runPromise(Effect.flip(handle.result));
    expect(err._tag).toBe("AgentInterrupted");
    expect((err as AgentInterrupted).reason).toBe("Fiber interrupted");
  });
});

// ---------------------------------------------------------------------------
// DispatchHandle — inject
// ---------------------------------------------------------------------------

describe("DispatchHandle — inject", () => {
  test("inject Interrupt: result fails with AgentInterrupted at next iteration boundary", async () => {
    const handle = await Effect.runPromise(
      Effect.provide(
        dispatch(blueprint, "task"),
        Layer.merge(Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
          ]),
          DefaultSatelliteRing,
        ), NoopDispatchLog),
      ),
    );

    await Effect.runPromise(handle.inject({ _tag: "Interrupt" }));

    const err = await Effect.runPromise(Effect.flip(handle.result));
    expect(err._tag).toBe("AgentInterrupted");
    expect((err as AgentInterrupted).reason).toContain("Interrupted");
  });
});

// ---------------------------------------------------------------------------
// DispatchHandle — messages snapshot
// ---------------------------------------------------------------------------

describe("DispatchHandle — messages", () => {
  test("exposes current message history after completion", async () => {
    const handle = await Effect.runPromise(
      Effect.provide(
        dispatch(blueprint, "hello"),
        Layer.merge(Layer.merge(makeMockLanguageModel([textParts("hi")]), DefaultSatelliteRing), NoopDispatchLog),
      ),
    );
    await Effect.runPromise(handle.result);
    const msgs = await Effect.runPromise(handle.messages);
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0]).toEqual({ role: "system", content: "You are a test agent." });
    expect(msgs[1]).toEqual({ role: "user", content: "hello" });
  });

  test("includes tool messages after tool call iteration", async () => {
    const handle = await Effect.runPromise(
      Effect.provide(
        dispatch(blueprint, "task"),
        Layer.merge(Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
            textParts("done"),
          ]),
          DefaultSatelliteRing,
        ), NoopDispatchLog),
      ),
    );
    await Effect.runPromise(handle.result);
    const msgs = await Effect.runPromise(handle.messages);
    // system + user + assistant(tool-call) + tool(result) = 4 minimum
    expect(msgs.length).toBeGreaterThanOrEqual(4);
    const roles = msgs.map((m) => m.role);
    expect(roles).toContain("assistant");
    expect(roles).toContain("tool");
  });
});

// ---------------------------------------------------------------------------
// DispatchOptions — restore from previous session
// ---------------------------------------------------------------------------

describe("dispatch — DispatchOptions", () => {
  test("accepts initial messages for session restoration", async () => {
    const restored = [
      { role: "system" as const, content: "You are a test agent." },
      { role: "user" as const, content: "original task" },
      { role: "assistant" as const, content: "I started working on it." },
      { role: "user" as const, content: "continue" },
    ];
    const result = await Effect.runPromise(
      Effect.provide(
        dispatchAwait(blueprint, "continue", { messages: restored }),
        Layer.merge(Layer.merge(makeMockLanguageModel([textParts("done")]), DefaultSatelliteRing), NoopDispatchLog),
      ),
    );
    expect(result.content).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// DispatchLog — audit / replay / restore
// ---------------------------------------------------------------------------

describe("DispatchLog — InMemory", () => {
  test("records events during dispatch", async () => {
    const { events, log } = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* DispatchLog;
          const handle = yield* dispatch(blueprint, "task");
          const evts: DispatchEvent[] = [];
          yield* Stream.tap(handle.events, (e) =>
            Effect.sync(() => { evts.push(e); }),
          ).pipe(Stream.runDrain);
          return { events: evts, log };
        }),
        Layer.merge(Layer.merge(makeMockLanguageModel([textParts("hello")]), DefaultSatelliteRing), InMemoryDispatchLog),
      ),
    );
    const logged = await Effect.runPromise(log.events());
    expect(logged.length).toBeGreaterThanOrEqual(events.length);
    expect(logged[0]!.event._tag).toBe("Calling");
    expect(logged[0]!.dispatchId).toContain("test-grunt");
  });

  test("snapshots messages for restore", async () => {
    const log = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* DispatchLog;
          yield* dispatchAwait(blueprint, "task");
          return log;
        }),
        Layer.merge(Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
            textParts("done"),
          ]),
          DefaultSatelliteRing,
        ), InMemoryDispatchLog),
      ),
    );
    // Get all events to find the dispatchId
    const allEvents = await Effect.runPromise(log.events());
    const dispatchId = allEvents[0]!.dispatchId;

    // Restore should return the latest snapshot
    const opts = await Effect.runPromise(log.restore(dispatchId));
    expect(opts).toBeDefined();
    expect(opts!.messages!.length).toBeGreaterThanOrEqual(2);
    expect(opts!.iteration).toBeGreaterThanOrEqual(0);
  });

  test("restore returns undefined for unknown dispatchId", async () => {
    const log = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          return yield* DispatchLog;
        }),
        InMemoryDispatchLog,
      ),
    );
    const opts = await Effect.runPromise(log.restore("nonexistent"));
    expect(opts).toBeUndefined();
  });

  test("records parentDispatchId and restores it", async () => {
    const log = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* DispatchLog;
          yield* dispatchAwait(blueprint, "task", {
            dispatchId: "child-1",
            parentDispatchId: "parent-1",
          });
          return log;
        }),
        Layer.merge(Layer.merge(makeMockLanguageModel([textParts("hi")]), DefaultSatelliteRing), InMemoryDispatchLog),
      ),
    );
    const opts = await Effect.runPromise(log.restore("child-1"));
    expect(opts).toBeDefined();
    expect(opts!.parentDispatchId).toBe("parent-1");
    expect(opts!.dispatchId).toBe("child-1");
  });
});

// ---------------------------------------------------------------------------
// SatelliteAction events
// ---------------------------------------------------------------------------

describe("DispatchLog — SatelliteAction events", () => {
  test("logs satellite actions when a satellite returns non-Pass", async () => {
    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* DispatchLog;
          yield* dispatchAwait(blueprint, "task");
          return yield* log.events();
        }),
        Layer.merge(Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "fail", arguments: "{}" }]),
            textParts("recovered"),
          ]),
          DefaultSatelliteRing,
        ), InMemoryDispatchLog),
      ),
    );
    const satActions = events.filter((e) => e.event._tag === "SatelliteAction");
    expect(satActions.length).toBeGreaterThanOrEqual(1);
    const recovery = satActions.find(
      (e) => e.event._tag === "SatelliteAction" && e.event.satellite === "tool-recovery",
    );
    expect(recovery).toBeDefined();
    if (recovery && recovery.event._tag === "SatelliteAction") {
      expect(recovery.event.action).toBe("RecoverToolError");
      expect(recovery.event.phase).toBe("ToolError");
    }
  });
});

// ---------------------------------------------------------------------------
// Injected events
// ---------------------------------------------------------------------------

describe("DispatchLog — Injected events", () => {
  test("logs Interrupt injection", async () => {
    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const log = yield* DispatchLog;
          const handle = yield* dispatch(blueprint, "task");
          yield* handle.inject({ _tag: "Interrupt", reason: "user cancelled" });
          // Wait for result (will be AgentInterrupted)
          yield* Effect.flip(handle.result);
          return yield* log.events();
        }),
        Layer.merge(Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
          ]),
          DefaultSatelliteRing,
        ), InMemoryDispatchLog),
      ),
    );
    const injections = events.filter((e) => e.event._tag === "Injected");
    expect(injections.length).toBeGreaterThanOrEqual(1);
    const interrupt = injections.find(
      (e) => e.event._tag === "Injected" && e.event.injection === "Interrupt",
    );
    expect(interrupt).toBeDefined();
    if (interrupt && interrupt.event._tag === "Injected") {
      expect(interrupt.event.detail).toBe("user cancelled");
    }
  });
});
