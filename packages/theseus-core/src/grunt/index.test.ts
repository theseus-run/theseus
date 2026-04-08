import { describe, expect, test } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import * as AiError from "effect/unstable/ai/AiError";
import type { Blueprint } from "../agent/index.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import type { DispatchEvent } from "../dispatch/index.ts";
import { DefaultToolCallPolicy } from "../dispatch/policy.ts";
import {
  makeMockLanguageModel, textParts, toolCallParts,
} from "../test-utils/mock-language-model.ts";
import { grunt, gruntAwait } from "./index.ts";

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
      Effect.provide(gruntAwait(blueprint, "hello"), Layer.merge(makeMockLanguageModel([textParts("hi there")]), DefaultToolCallPolicy)),
    );
    expect(result.content).toBe("hi there");
  });

  test("accumulates usage", async () => {
    const result = await Effect.runPromise(
      Effect.provide(gruntAwait(blueprint, "hello"), Layer.merge(makeMockLanguageModel([textParts("ok", 20, 8)]), DefaultToolCallPolicy)),
    );
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
  });
});

describe("gruntAwait — tool call loop", () => {
  test("executes tool and returns final text", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        gruntAwait(blueprint, "task"),
        Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"world"}' }]),
            textParts("echoed: world", 20, 10),
          ]),
          DefaultToolCallPolicy,
        ),
      ),
    );
    expect(result.content).toBe("echoed: world");
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });
});

describe("gruntAwait — error", () => {
  test("converts AiError to AgentLLMError", async () => {
    const aiErr = AiError.make({
      module: "MockLLM",
      method: "generateText",
      reason: new AiError.AuthenticationError({ kind: "InvalidKey" }),
    });
    const err = await Effect.runPromise(
      Effect.provide(
        Effect.flip(gruntAwait(blueprint, "task")),
        Layer.merge(makeMockLanguageModel([aiErr]), DefaultToolCallPolicy),
      ),
    );
    expect(err._tag).toBe("AgentLLMError");
  });
});

// ===========================================================================
// grunt — handle with events stream
// ===========================================================================

describe("grunt — events stream", () => {
  test("emits Calling, TextDelta(s), then Done for text-only", async () => {
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
        Layer.merge(makeMockLanguageModel([textParts("hello")]), DefaultToolCallPolicy),
      ),
    );
    const tags = events.map((e) => e._tag);
    expect(tags[0]).toBe("Calling");
    expect(tags[tags.length - 1]).toBe("Done");
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
        Layer.merge(
          makeMockLanguageModel([
            toolCallParts([{ id: "c1", name: "echo", arguments: '{"msg":"x"}' }]),
            textParts("done"),
          ]),
          DefaultToolCallPolicy,
        ),
      ),
    );
    const tags = events.map((e) => e._tag);
    expect(tags.indexOf("ToolCalling")).toBeLessThan(tags.indexOf("ToolResult"));
    expect(tags.filter((t) => t === "Calling").length).toBe(2);
    expect(tags[tags.length - 1]).toBe("Done");
  });
});

describe("grunt — handle has no inject/interrupt", () => {
  test("GruntHandle only exposes events and result", async () => {
    const handle = await Effect.runPromise(
      Effect.provide(grunt(blueprint, "task"), Layer.merge(makeMockLanguageModel([textParts("hi")]), DefaultToolCallPolicy)),
    );
    expect(handle).toHaveProperty("events");
    expect(handle).toHaveProperty("result");
    expect(handle).not.toHaveProperty("inject");
    expect(handle).not.toHaveProperty("interrupt");
  });
});
