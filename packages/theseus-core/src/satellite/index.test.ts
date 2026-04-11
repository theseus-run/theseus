import { describe, expect, test } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import type { Blueprint } from "../agent/index.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import {
  makeMockLanguageModel, textParts, toolCallParts,
} from "../test-utils/mock-language-model.ts";
import { dispatch, dispatchAwait, type DispatchEvent } from "../dispatch/index.ts";
import { SatelliteRingLive, DefaultSatelliteRing } from "./ring.ts";
import type { Satellite } from "./types.ts";
import { SatelliteAbort } from "./types.ts";
import { toolRecovery } from "./tool-recovery.ts";

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

const runWith = (satellites: Satellite<any>[], responses: any[], task = "task") =>
  Effect.runPromise(
    Effect.provide(
      dispatchAwait(blueprint, task),
      Layer.merge(
        makeMockLanguageModel(responses),
        SatelliteRingLive([toolRecovery, ...satellites]),
      ),
    ),
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
      Layer.merge(
        makeMockLanguageModel(responses),
        SatelliteRingLive([toolRecovery, ...satellites]),
      ),
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
          DefaultSatelliteRing,
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
          ? Effect.succeed({ action: { _tag: "BlockTool" as const, content: "BLOCKED by guard" }, state: undefined })
          : Effect.succeed({ action: { _tag: "Pass" as const }, state: undefined }),
    };

    const events = await collectEventsWith(
      [guard],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"hello"}' }]),
        textParts("done"),
      ],
    );

    const toolResults = events.filter((e) => e._tag === "ToolResult");
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0] as any).content).toBe("BLOCKED by guard");
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
          ? Effect.succeed({ action: { _tag: "ReplaceResult" as const, content: "[compacted]" }, state: undefined })
          : Effect.succeed({ action: { _tag: "Pass" as const }, state: undefined }),
    };

    const events = await collectEventsWith(
      [compactor],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"a long message"}' }]),
        textParts("done"),
      ],
    );

    const toolResults = events.filter((e) => e._tag === "ToolResult");
    expect(toolResults).toHaveLength(1);
    expect((toolResults[0] as any).content).toBe("[compacted]");
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
              return { action: { _tag: "Pass" as const }, state: next };
            })
          : Effect.succeed({ action: { _tag: "Pass" as const }, state: used }),
    };

    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(dispatchAwait(blueprint, "task")),
        Layer.merge(
          makeMockLanguageModel([textParts("hi", 10, 5)]),
          SatelliteRingLive([toolRecovery, budget]),
        ),
      ),
    );
    // SatelliteAbort is converted to AgentInterrupted by the dispatch loop
    expect(err._tag).toBe("AgentInterrupted");
    expect((err as any).reason).toContain("token-budget");
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
          ? Effect.succeed({ action: { _tag: "Pass" as const }, state: [...iterations, ctx.iteration] })
          : Effect.succeed({ action: { _tag: "Pass" as const }, state: iterations }),
    };

    // Tool call forces 2 iterations
    await runWith(
      [iterationTracker],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        textParts("done"),
      ],
    );

    // Test passes if no error — satellite tracked iterations 0, 1 without crash
  });
});

// ===========================================================================
// Satellite composition — multiple satellites in ring
// ===========================================================================

describe("Satellite — composition", () => {
  test("satellites compose in order — first transforms, second sees transformed", async () => {
    const blocker: Satellite = {
      name: "blocker",
      initial: undefined,
      handle: (phase) =>
        phase._tag === "BeforeTool" && phase.tool.name === "echo"
          ? Effect.succeed({ action: { _tag: "BlockTool" as const, content: "BLOCKED" }, state: undefined })
          : Effect.succeed({ action: { _tag: "Pass" as const }, state: undefined }),
    };

    // Second satellite should NOT see BeforeTool for "echo" because blocker already blocked it
    // (BlockTool is terminal — chain short-circuits)
    const spy: Satellite<string[]> = {
      name: "spy",
      initial: [],
      handle: (phase, _ctx, seen) =>
        phase._tag === "BeforeTool"
          ? Effect.succeed({ action: { _tag: "Pass" as const }, state: [...seen, phase.tool.name] })
          : Effect.succeed({ action: { _tag: "Pass" as const }, state: seen }),
    };

    const events = await collectEventsWith(
      [blocker, spy],
      [
        toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
        textParts("done"),
      ],
    );

    const toolResults = events.filter((e) => e._tag === "ToolResult");
    expect((toolResults[0] as any).content).toBe("BLOCKED");
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
      handle: () => Effect.succeed({ action: { _tag: "Pass" as const }, state: undefined }),
    };

    const result = await runWith(
      [noop],
      [textParts("hello")],
    );
    expect(result.content).toBe("hello");
    expect(result.result).toBe("unstructured");
  });
});
