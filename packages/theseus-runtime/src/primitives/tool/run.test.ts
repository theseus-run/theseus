import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import {
  ToolError,
  ToolErrorInput,
  ToolErrorOutput,
  ToolErrorRetriable,
  defineTool,
  manualSchema,
} from "./index.ts";
import { fromZod } from "./zod.ts";
import { z } from "zod";
import { callTool } from "./run.ts";

// ---------------------------------------------------------------------------
// Test tools
// ---------------------------------------------------------------------------

const echoTool = defineTool({
  name: "echo",
  description: "Echo the input",
  inputSchema: manualSchema(
    { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] },
    (raw) => {
      const r = raw as { msg?: unknown };
      if (typeof r.msg !== "string") throw new Error("msg must be a string");
      return r as { msg: string };
    },
  ),
  safety: "readonly",
  capabilities: ["test"],
  execute: ({ msg }, _ctx) => Effect.succeed(msg),
  serialize: (s) => s,
});

const validatedTool = defineTool({
  name: "validated",
  description: "Tool with output validation",
  inputSchema: fromZod(z.object({ x: z.number() })),
  outputSchema: fromZod(z.object({ result: z.number() })),
  safety: "readonly",
  capabilities: [],
  execute: ({ x }, _ctx) => Effect.succeed({ result: x * 2 }),
  serialize: (o) => String(o.result),
});

const badOutputTool = defineTool({
  name: "badOutput",
  description: "Returns output that fails validation",
  inputSchema: fromZod(z.object({ x: z.number() })),
  outputSchema: fromZod(z.object({ result: z.number() })),
  safety: "readonly",
  capabilities: [],
  // biome-ignore lint/suspicious/noExplicitAny: intentionally returning wrong type for test
  execute: ({ x }, _ctx) => Effect.succeed({ result: `not-a-number-${x}` } as any),
  serialize: (o) => String(o.result),
});

const permanentFailTool = defineTool({
  name: "permFail",
  description: "Always fails permanently",
  inputSchema: manualSchema(
    { type: "object", properties: {}, required: [] },
    (raw) => raw as Record<string, never>,
  ),
  safety: "readonly",
  capabilities: [],
  execute: (_input, { fail }) => Effect.fail(fail("permanent")),
  serialize: () => "unreachable",
});

// ---------------------------------------------------------------------------
// callTool — happy path
// ---------------------------------------------------------------------------

describe("callTool", () => {
  test("decodes input, executes, returns output", async () => {
    const result = await Effect.runPromise(callTool(echoTool, { msg: "hello" }));
    expect(result).toBe("hello");
  });

  test("validates output when outputSchema provided", async () => {
    const result = await Effect.runPromise(callTool(validatedTool, { x: 21 }));
    expect(result).toEqual({ result: 42 });
  });

  test("skips output validation when no outputSchema", async () => {
    const result = await Effect.runPromise(callTool(echoTool, { msg: "no schema" }));
    expect(result).toBe("no schema");
  });
});

// ---------------------------------------------------------------------------
// callTool — ToolErrorInput
// ---------------------------------------------------------------------------

describe("callTool — ToolErrorInput", () => {
  test("returns ToolErrorInput when decode fails", async () => {
    const err = await Effect.runPromise(
      callTool(echoTool, { msg: 123 }).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolErrorInput");
    expect((err as ToolErrorInput).tool).toBe("echo");
  });

  test("returns ToolErrorInput when required field missing", async () => {
    const err = await Effect.runPromise(
      callTool(echoTool, {}).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolErrorInput");
  });
});

// ---------------------------------------------------------------------------
// callTool — ToolErrorOutput
// ---------------------------------------------------------------------------

describe("callTool — ToolErrorOutput", () => {
  test("returns ToolErrorOutput when output validation fails", async () => {
    const err = await Effect.runPromise(
      callTool(badOutputTool, { x: 5 }).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolErrorOutput");
    expect((err as ToolErrorOutput).tool).toBe("badOutput");
    expect((err as ToolErrorOutput).output).toEqual({ result: "not-a-number-5" });
  });
});

// ---------------------------------------------------------------------------
// callTool — ToolError (permanent)
// ---------------------------------------------------------------------------

describe("callTool — ToolError", () => {
  test("propagates permanent ToolError without retry", async () => {
    const err = await Effect.runPromise(
      callTool(permanentFailTool, {}).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
    expect((err as ToolError).message).toBe("permanent");
  });
});

// ---------------------------------------------------------------------------
// callTool — retry on ToolErrorRetriable
// ---------------------------------------------------------------------------

describe("callTool — retry", () => {
  test("retries retriable errors and succeeds", async () => {
    let attempts = 0;
    const flakyTool = defineTool({
      name: "flaky",
      description: "Fails twice then succeeds",
      inputSchema: manualSchema(
        { type: "object", properties: {}, required: [] },
        (raw) => raw as Record<string, never>,
      ),
      safety: "readonly",
      capabilities: [],
      execute: (_input, { retriable }) =>
        Effect.suspend(() => {
          attempts++;
          return attempts <= 2
            ? Effect.fail(retriable("not yet"))
            : Effect.succeed("done");
        }),
      serialize: (s) => s,
    });

    const result = await Effect.runPromise(callTool(flakyTool, {}));
    expect(result).toBe("done");
    expect(attempts).toBe(3);
  });

  test("converts exhausted ToolErrorRetriable to ToolError", async () => {
    const alwaysRetriableTool = defineTool({
      name: "alwaysFail",
      description: "Always fails with retriable",
      inputSchema: manualSchema(
        { type: "object", properties: {}, required: [] },
        (raw) => raw as Record<string, never>,
      ),
      safety: "readonly",
      capabilities: [],
      execute: (_input, { retriable }) =>
        Effect.fail(retriable("always failing")),
      serialize: () => "unreachable",
    });

    const err = await Effect.runPromise(
      callTool(alwaysRetriableTool, {}).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
    expect((err as ToolError).message).toBe("always failing");
    expect((err as ToolError).cause).toBeInstanceOf(ToolErrorRetriable);
  });

  test("does not retry permanent ToolError", async () => {
    let attempts = 0;
    const permTool = defineTool({
      name: "perm",
      description: "Fails permanently on first call",
      inputSchema: manualSchema(
        { type: "object", properties: {}, required: [] },
        (raw) => raw as Record<string, never>,
      ),
      safety: "readonly",
      capabilities: [],
      execute: (_input, { fail }) =>
        Effect.suspend(() => {
          attempts++;
          return Effect.fail(fail("permanent failure"));
        }),
      serialize: () => "unreachable",
    });

    const err = await Effect.runPromise(
      callTool(permTool, {}).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
    expect(attempts).toBe(1);
  });
});
