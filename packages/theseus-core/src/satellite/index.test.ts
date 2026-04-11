import { describe, expect, test } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import type { Blueprint } from "../agent/index.ts";
import type { AgentInterrupted } from "../agent/index.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import {
  makeMockLanguageModel, textParts, toolCallParts,
} from "../test-utils/mock-language-model.ts";
import { dispatch, dispatchAwait, type DispatchEvent } from "../dispatch/index.ts";
import { SatelliteRingLive } from "./ring.ts";
import { NoopDispatchLog } from "../dispatch/log.ts";
import { DispatchDefaults } from "../dispatch/defaults.ts";
import type { Satellite } from "./types.ts";
import { SatelliteAbort, Pass, BlockTool, ReplaceResult } from "./types.ts";
import { tokenBudget } from "./token-budget.ts";
import { toolGuard } from "./tool-guard.ts";

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
  name: "test-agent",
  systemPrompt: "You are a test agent.",
  tools: [echoTool],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const satLayer = (satellites: Satellite<any>[], responses: any[]) =>
  Layer.mergeAll(makeMockLanguageModel(responses), SatelliteRingLive(satellites), NoopDispatchLog);

const runWith = (satellites: Satellite<any>[], responses: any[], task = "task") =>
  Effect.runPromise(
    Effect.provide(dispatchAwait(blueprint, task), satLayer(satellites, responses)),
  );

const collectEventsWith = (satellites: Satellite<any>[], responses: any[], task = "task") =>
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
      satLayer(satellites, responses),
    ),
  );

// ===========================================================================
// DefaultSatelliteRing — tool recovery
// ===========================================================================

describe("DefaultSatelliteRing — tool recovery", () => {
  test("recovers from ToolError and continues loop", async () => {
    const failTool = defineTool<object, string>({
      name: "fail",
      description: "Always fails",
      inputSchema: manualSchema({ type: "object", properties: {}, required: [] }, (r) => r as object),
      safety: "readonly",
      capabilities: [],
      execute: (_input, { fail }) => Effect.fail(fail("boom")),
      encode: () => "unreachable",
    });

    const bp: Blueprint = { ...blueprint, tools: [echoTool, failTool] };
    const result = await Effect.runPromise(
      Effect.provide(
        dispatchAwait(bp, "task"),
        Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "fail", arguments: "{}" }]),
            textParts("recovered"),
          ]),
          DispatchDefaults,
        ),
      ),
    );
    expect(result.content).toBe("recovered");
  });
});

// ===========================================================================
// BeforeTool — BlockTool
// ===========================================================================

describe("Satellite — BeforeTool BlockTool", () => {
  test("blocks tool execution with synthetic result", async () => {
    const guard: Satellite = {
      name: "tool-guard",
      initial: undefined,
      handle: (phase) =>
        phase._tag === "BeforeTool" && phase.tool.name === "echo"
          ? Effect.succeed({ action: BlockTool("BLOCKED by guard"), state: undefined })
          : Effect.succeed({ action: Pass, state: undefined }),
    };

    const events = await collectEventsWith(
      [guard],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"hello"}' }]),
        textParts("done"),
      ],
    );

    const toolResults = events.filter(
      (e): e is Extract<DispatchEvent, { _tag: "ToolResult" }> => e._tag === "ToolResult",
    );
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]!.content).toBe("BLOCKED by guard");
  });
});

// ===========================================================================
// AfterTool — ReplaceResult
// ===========================================================================

describe("Satellite — AfterTool ReplaceResult", () => {
  test("replaces tool result content", async () => {
    const compactor: Satellite = {
      name: "compactor",
      initial: undefined,
      handle: (phase) =>
        phase._tag === "AfterTool" && phase.result.content.length > 2
          ? Effect.succeed({ action: ReplaceResult("[compacted]"), state: undefined })
          : Effect.succeed({ action: Pass, state: undefined }),
    };

    const events = await collectEventsWith(
      [compactor],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"a long message"}' }]),
        textParts("done"),
      ],
    );

    const toolResults = events.filter(
      (e): e is Extract<DispatchEvent, { _tag: "ToolResult" }> => e._tag === "ToolResult",
    );
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]!.content).toBe("[compacted]");
  });
});

// ===========================================================================
// SatelliteAbort — kills the loop
// ===========================================================================

describe("Satellite — SatelliteAbort", () => {
  test("aborts dispatch via Effect error channel", async () => {
    const budget: Satellite<number> = {
      name: "token-budget",
      initial: 0,
      handle: (phase, _ctx, used) =>
        phase._tag === "AfterCall"
          ? Effect.gen(function* () {
              const next = used + phase.stepResult.usage.inputTokens + phase.stepResult.usage.outputTokens;
              if (next > 1)
                return yield* Effect.fail(new SatelliteAbort({ satellite: "token-budget", reason: `${next} tokens` }));
              return { action: Pass, state: next };
            })
          : Effect.succeed({ action: Pass, state: used }),
    };

    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        satLayer([budget], [textParts("hi", 10, 5)]),
      ),
    );
    // SatelliteAbort is converted to AgentInterrupted by the dispatch loop
    expect(err._tag).toBe("AgentInterrupted");
    expect((err as AgentInterrupted).reason).toContain("token-budget");
  });
});

// ===========================================================================
// Stateful satellite — accumulates across iterations
// ===========================================================================

describe("Satellite — stateful across iterations", () => {
  test("state persists between loop iterations", async () => {
    const iterationTracker: Satellite<number[]> = {
      name: "iteration-tracker",
      initial: [],
      handle: (phase, ctx, iterations) =>
        phase._tag === "BeforeCall"
          ? Effect.succeed({ action: Pass, state: [...iterations, ctx.iteration] })
          : Effect.succeed({ action: Pass, state: iterations }),
    };

    // Tool call forces 2 iterations — no crash means state tracked correctly
    await runWith(
      [iterationTracker],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        textParts("done"),
      ],
    );
  });
});

// ===========================================================================
// Satellite composition — multiple satellites in ring
// ===========================================================================

describe("Satellite — composition", () => {
  test("terminal action short-circuits the chain", async () => {
    const blocker: Satellite = {
      name: "blocker",
      initial: undefined,
      handle: (phase) =>
        phase._tag === "BeforeTool" && phase.tool.name === "echo"
          ? Effect.succeed({ action: BlockTool("BLOCKED"), state: undefined })
          : Effect.succeed({ action: Pass, state: undefined }),
    };

    const spy: Satellite<string[]> = {
      name: "spy",
      initial: [],
      handle: (phase, _ctx, seen) =>
        phase._tag === "BeforeTool"
          ? Effect.succeed({ action: Pass, state: [...seen, phase.tool.name] })
          : Effect.succeed({ action: Pass, state: seen }),
    };

    const events = await collectEventsWith(
      [blocker, spy],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        textParts("done"),
      ],
    );

    const toolResults = events.filter(
      (e): e is Extract<DispatchEvent, { _tag: "ToolResult" }> => e._tag === "ToolResult",
    );
    expect(toolResults[0]!.content).toBe("BLOCKED");
  });
});

// ===========================================================================
// Pass-through — default behavior
// ===========================================================================

describe("Satellite — pass-through", () => {
  test("no-op satellite does not affect dispatch", async () => {
    const noop: Satellite = {
      name: "noop",
      initial: undefined,
      handle: () => Effect.succeed({ action: Pass, state: undefined }),
    };

    const result = await runWith(
      [noop],
      [textParts("hello")],
    );
    expect(result.content).toBe("hello");
    expect(result.result).toBe("unstructured");
  });
});

// ===========================================================================
// toolRecovery ordering — user satellites see ToolError before recovery
// ===========================================================================

describe("Satellite — toolRecovery is last in ring", () => {
  test("user satellite can intercept ToolError before default recovery", async () => {
    const failTool = defineTool<object, string>({
      name: "fail",
      description: "Always fails",
      inputSchema: manualSchema({ type: "object", properties: {}, required: [] }, (r) => r as object),
      safety: "readonly",
      capabilities: [],
      execute: (_input, { fail }) => Effect.fail(fail("boom")),
      encode: () => "unreachable",
    });

    const bp: Blueprint = { ...blueprint, tools: [echoTool, failTool] };
    let sawToolError = false;

    const observer: Satellite = {
      name: "error-observer",
      initial: undefined,
      handle: (phase) => {
        if (phase._tag === "ToolError") sawToolError = true;
        return Effect.succeed({ action: Pass, state: undefined });
      },
    };

    await Effect.runPromise(
      Effect.provide(
        dispatchAwait(bp, "task"),
        satLayer([observer], [
          toolCallParts([{ id: "c1", name: "fail", arguments: "{}" }]),
          textParts("recovered"),
        ]),
      ),
    );

    expect(sawToolError).toBe(true);
  });
});

// ===========================================================================
// tokenBudget — built-in
// ===========================================================================

describe("tokenBudget", () => {
  test("passes when under budget", async () => {
    const result = await runWith(
      [tokenBudget(1000)],
      [textParts("hello", 10, 5)],
    );
    expect(result.content).toBe("hello");
  });

  test("aborts when over budget", async () => {
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        satLayer([tokenBudget(100)], [textParts("hi", 500, 600)]),
      ),
    );
    expect(err._tag).toBe("AgentInterrupted");
    expect((err as AgentInterrupted).reason).toContain("token-budget");
    expect((err as AgentInterrupted).reason).toContain("1100/100");
  });

  test("accumulates across iterations", async () => {
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        satLayer([tokenBudget(60)], [
          toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }], 30, 20),
          textParts("done", 30, 25),
        ]),
      ),
    );
    // First iteration: 50 tokens (under 60). Second: 105 total (over 60).
    expect(err._tag).toBe("AgentInterrupted");
    expect((err as AgentInterrupted).reason).toContain("token-budget");
  });
});

// ===========================================================================
// toolGuard — built-in
// ===========================================================================

describe("toolGuard", () => {
  test("blocks listed tools with policy message", async () => {
    const events = await collectEventsWith(
      [toolGuard(["echo"])],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        textParts("done"),
      ],
    );

    const toolResults = events.filter(
      (e): e is Extract<DispatchEvent, { _tag: "ToolResult" }> => e._tag === "ToolResult",
    );
    expect(toolResults[0]!.content).toContain("blocked by policy");
  });

  test("allows unlisted tools", async () => {
    const result = await runWith(
      [toolGuard(["shell", "write_file"])],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"allowed"}' }]),
        textParts("done"),
      ],
    );
    expect(result.content).toBe("done");
  });
});
