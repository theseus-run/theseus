import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  compareToolSafety,
  defineTool,
  manualSchema,
  type ToolAny,
  type ToolError,
  ToolErrorInput,
  ToolErrorOutput,
  type ToolSafety,
  toolCapabilities,
  toolContext,
  toolHasCapability,
  toolsWithMaxSafety,
  toolsWithoutCapability,
} from "./index.ts";

// ---------------------------------------------------------------------------
// Test tools
// ---------------------------------------------------------------------------

const echoTool = defineTool({
  name: "echo",
  description: "Echo the input back",
  inputSchema: manualSchema(
    {
      type: "object",
      properties: { message: { type: "string", description: "Message to echo" } },
      required: ["message"],
    },
    (raw) => raw as { message: string },
  ),
  safety: "readonly",
  capabilities: ["test.echo"],
  execute: ({ message }, _ctx) => Effect.succeed({ echoed: message }),
  encode: (output) => output.echoed,
});

const addTool = defineTool({
  name: "add",
  description: "Add two numbers",
  inputSchema: manualSchema(
    {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
    },
    (raw) => raw as { a: number; b: number },
  ),
  safety: "readonly",
  capabilities: ["math"],
  execute: ({ a, b }, _ctx) => Effect.succeed(a + b),
  encode: (n) => String(n),
});

const failTool = defineTool({
  name: "fail",
  description: "Always fails with permanent error",
  inputSchema: manualSchema(
    {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
    (raw) => raw as { reason: string },
  ),
  safety: "readonly",
  capabilities: ["test.fail"],
  execute: ({ reason }, { fail }) => Effect.fail(fail(reason)),
  encode: () => "unreachable",
});

const retriableTool = defineTool({
  name: "flaky",
  description: "Fails with retriable error",
  inputSchema: manualSchema(
    { type: "object", properties: {}, required: [] },
    (raw) => raw as Record<string, never>,
  ),
  safety: "readonly",
  capabilities: [],
  execute: (_input, { retriable }) => Effect.fail(retriable("rate limited")),
  encode: () => "unreachable",
});

const readTool = defineTool({
  name: "readFile",
  description: "Read a file",
  inputSchema: manualSchema(
    {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    (raw) => raw as { path: string },
  ),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path }, _ctx) => Effect.succeed(`contents of ${path}`),
  encode: (s) => s,
});

const writeTool = defineTool({
  name: "writeFile",
  description: "Write a file",
  inputSchema: manualSchema(
    {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    (raw) => raw as { path: string; content: string },
  ),
  safety: "write",
  capabilities: ["fs.read", "fs.write"],
  execute: ({ path, content }, _ctx) => Effect.succeed(`wrote ${content.length} bytes to ${path}`),
  encode: (s) => s,
});

const deleteTool = defineTool({
  name: "deleteFile",
  description: "Delete a file",
  inputSchema: manualSchema(
    {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    (raw) => raw as { path: string },
  ),
  safety: "destructive",
  capabilities: ["fs.write"],
  execute: ({ path }, _ctx) => Effect.succeed(`deleted ${path}`),
  encode: (s) => s,
});

// ---------------------------------------------------------------------------
// defineTool
// ---------------------------------------------------------------------------

describe("defineTool", () => {
  test("returns the tool with correct name and metadata", () => {
    expect(echoTool.name).toBe("echo");
    expect(echoTool.capabilities).toEqual(["test.echo"]);
    expect(echoTool.safety).toBe("readonly");
  });

  test("inputSchema is a plain JSON schema object (not SchemaAdapter)", () => {
    expect(echoTool.inputSchema).toEqual({
      type: "object",
      properties: { message: { type: "string", description: "Message to echo" } },
      required: ["message"],
    });
  });

  test("outputSchema is plain JSON when provided", () => {
    const toolWithOutput = defineTool({
      name: "test",
      description: "test",
      inputSchema: manualSchema({ type: "object" }, (r) => r),
      outputSchema: manualSchema(
        { type: "object", properties: { x: { type: "number" } } },
        (r) => r as { x: number },
      ),
      safety: "readonly",
      capabilities: [],
      execute: (_i, _c) => Effect.succeed({ x: 1 }),
      encode: (o) => String(o.x),
    });
    expect(toolWithOutput.outputSchema).toEqual({
      type: "object",
      properties: { x: { type: "number" } },
    });
  });
});

// ---------------------------------------------------------------------------
// decode (Effect-based)
// ---------------------------------------------------------------------------

describe("decode", () => {
  test("decodes valid input as Effect", async () => {
    const input = await Effect.runPromise(echoTool.decode({ message: "hello" }));
    expect(input.message).toBe("hello");
  });

  test("decodes multi-field input", async () => {
    const input = await Effect.runPromise(addTool.decode({ a: 2, b: 3 }));
    expect(input.a).toBe(2);
    expect(input.b).toBe(3);
  });

  test("fails with ToolErrorInput on bad input", async () => {
    const decodingTool = defineTool({
      name: "strict",
      description: "Strict decode",
      inputSchema: manualSchema(
        { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
        (raw) => {
          const r = raw as { x?: unknown };
          if (typeof r.x !== "number") throw new Error("x must be a number");
          return r as { x: number };
        },
      ),
      safety: "readonly",
      capabilities: [],
      execute: (i, _c) => Effect.succeed(i.x),
      encode: (n) => String(n),
    });

    const err = await Effect.runPromise(decodingTool.decode({ x: "bad" }).pipe(Effect.flip));
    expect(err._tag).toBe("ToolErrorInput");
    expect(err.tool).toBe("strict");
  });
});

// ---------------------------------------------------------------------------
// execute + encode
// ---------------------------------------------------------------------------

describe("execute + encode", () => {
  test("echo tool round-trips", async () => {
    const output = await Effect.runPromise(echoTool.execute({ message: "hello" }));
    const encoded = await Effect.runPromise(echoTool.encode(output));
    expect(encoded).toBe("hello");
  });

  test("add tool computes and encodes", async () => {
    const output = await Effect.runPromise(addTool.execute({ a: 10, b: 32 }));
    const encoded = await Effect.runPromise(addTool.encode(output));
    expect(encoded).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// encode (Effect-based)
// ---------------------------------------------------------------------------

describe("encode", () => {
  test("returns Effect<string>", async () => {
    const result = await Effect.runPromise(echoTool.encode({ echoed: "test" }));
    expect(result).toBe("test");
  });

  test("wraps sync encode errors in ToolError", async () => {
    const badEncodeTool = defineTool({
      name: "badEncode",
      description: "Encode throws",
      inputSchema: manualSchema({ type: "object" }, (r) => r),
      safety: "readonly",
      capabilities: [],
      execute: (_i, _c) => Effect.succeed({ x: 1 }),
      encode: () => {
        throw new Error("encode boom");
      },
    });

    const err = await Effect.runPromise(badEncodeTool.encode({ x: 1 }).pipe(Effect.flip));
    expect(err._tag).toBe("ToolError");
    expect(err.tool).toBe("badEncode");
    expect(err.message).toBe("Encode failed");
  });
});

// ---------------------------------------------------------------------------
// validate (Effect-based)
// ---------------------------------------------------------------------------

describe("validate", () => {
  test("is undefined when no outputSchema", () => {
    expect(echoTool.validate).toBeUndefined();
  });

  test("succeeds when output matches schema", async () => {
    const toolWithOutput = defineTool({
      name: "validated",
      description: "test",
      inputSchema: manualSchema({ type: "object" }, (r) => r as { x: number }),
      outputSchema: manualSchema({ type: "object" }, (r) => {
        const o = r as { result?: unknown };
        if (typeof o.result !== "number") throw new Error("bad");
        return o as { result: number };
      }),
      safety: "readonly",
      capabilities: [],
      execute: ({ x }, _c) => Effect.succeed({ result: x * 2 }),
      encode: (o) => String(o.result),
    });

    // biome-ignore lint/style/noNonNullAssertion: we know outputSchema was provided
    const result = await Effect.runPromise(toolWithOutput.validate!({ result: 42 }));
    expect(result).toEqual({ result: 42 });
  });

  test("fails with ToolErrorOutput when output is invalid", async () => {
    const toolWithOutput = defineTool({
      name: "validated",
      description: "test",
      inputSchema: manualSchema({ type: "object" }, (r) => r as { x: number }),
      outputSchema: manualSchema({ type: "object" }, (r) => {
        const o = r as { result?: unknown };
        if (typeof o.result !== "number") throw new Error("bad result");
        return o as { result: number };
      }),
      safety: "readonly",
      capabilities: [],
      execute: ({ x }, _c) => Effect.succeed({ result: x * 2 }),
      encode: (o) => String(o.result),
    });

    const err = await Effect.runPromise(
      // biome-ignore lint/style/noNonNullAssertion: we know outputSchema was provided
      // biome-ignore lint/suspicious/noExplicitAny: intentionally testing bad output
      toolWithOutput.validate!({ result: "nope" } as any).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolErrorOutput");
    expect(err.tool).toBe("validated");
    expect(err.output).toEqual({ result: "nope" });
  });
});

// ---------------------------------------------------------------------------
// Tool decoration via spread
// ---------------------------------------------------------------------------

describe("tool decoration via spread", () => {
  test("override decode to block .env files", async () => {
    const guardedTool: typeof readTool = {
      ...readTool,
      decode: (raw) =>
        readTool.decode(raw).pipe(
          Effect.flatMap((input) =>
            input.path.includes(".env")
              ? Effect.fail(
                  new ToolErrorInput({
                    tool: readTool.name,
                    message: "Access to .env files is blocked",
                  }),
                )
              : Effect.succeed(input),
          ),
        ),
    };

    // Normal path works
    const ok = await Effect.runPromise(guardedTool.decode({ path: "src/index.ts" }));
    expect(ok.path).toBe("src/index.ts");

    // .env path blocked
    const err = await Effect.runPromise(guardedTool.decode({ path: ".env" }).pipe(Effect.flip));
    expect(err._tag).toBe("ToolErrorInput");
    expect(err.message).toBe("Access to .env files is blocked");
  });
});

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

describe("ToolError", () => {
  test("has correct _tag via ctx.fail", async () => {
    const result = await Effect.runPromise(
      failTool.execute({ reason: "not found" }).pipe(Effect.flip),
    );
    expect(result._tag).toBe("ToolError");
    expect(result.tool).toBe("fail");
    expect(result.message).toBe("not found");
  });
});

describe("ToolErrorRetriable", () => {
  test("has correct _tag via ctx.retriable", async () => {
    const result = await Effect.runPromise(retriableTool.execute({} as never).pipe(Effect.flip));
    expect(result._tag).toBe("ToolErrorRetriable");
    expect(result.tool).toBe("flaky");
    expect(result.message).toBe("rate limited");
  });
});

describe("ToolErrorInput", () => {
  test("can be constructed directly", () => {
    const error = new ToolErrorInput({
      tool: "readFile",
      message: "Invalid input",
      cause: new Error("decode failed"),
    });
    expect(error._tag).toBe("ToolErrorInput");
    expect(error.tool).toBe("readFile");
  });
});

describe("ToolErrorOutput", () => {
  test("can be constructed with output value", () => {
    const error = new ToolErrorOutput({
      tool: "readFile",
      message: "Output validation failed",
      output: { bad: "data" },
    });
    expect(error._tag).toBe("ToolErrorOutput");
    expect(error.output).toEqual({ bad: "data" });
  });
});

describe("catchTags dispatches on error type", () => {
  test("catches ToolError specifically", async () => {
    const result = await Effect.runPromise(
      failTool.execute({ reason: "boom" }).pipe(
        Effect.catchTags({
          ToolError: (e) => Effect.succeed(`caught: ${e.message}`),
          ToolErrorRetriable: () => Effect.succeed("caught retriable"),
        }),
      ),
    );
    expect(result).toBe("caught: boom");
  });

  test("catches ToolErrorRetriable specifically", async () => {
    const result = await Effect.runPromise(
      retriableTool.execute({} as never).pipe(
        Effect.catchTags({
          ToolError: () => Effect.succeed("caught error"),
          ToolErrorRetriable: (e) => Effect.succeed(`caught: ${e.message}`),
        }),
      ),
    );
    expect(result).toBe("caught: rate limited");
  });
});

// ---------------------------------------------------------------------------
// ToolContext
// ---------------------------------------------------------------------------

describe("toolContext", () => {
  test("creates ToolError with correct tool name", () => {
    const ctx = toolContext("myTool");
    const err = ctx.fail("something went wrong");
    expect(err._tag).toBe("ToolError");
    expect(err.tool).toBe("myTool");
    expect(err.message).toBe("something went wrong");
  });

  test("creates ToolError with cause", () => {
    const ctx = toolContext("myTool");
    const cause = new Error("underlying");
    const err = ctx.fail("wrapped", cause);
    expect(err.cause).toBe(cause);
  });

  test("creates ToolErrorRetriable with correct tool name", () => {
    const ctx = toolContext("myTool");
    const err = ctx.retriable("rate limited");
    expect(err._tag).toBe("ToolErrorRetriable");
    expect(err.tool).toBe("myTool");
  });
});

describe("ToolContext via defineTool", () => {
  const ctxTool = defineTool({
    name: "ctxDemo",
    description: "Demonstrates ToolContext usage",
    inputSchema: manualSchema(
      { type: "object", properties: { shouldFail: { type: "boolean" } }, required: ["shouldFail"] },
      (raw) => raw as { shouldFail: boolean },
    ),
    safety: "readonly",
    capabilities: [],
    execute: ({ shouldFail }, { fail }) =>
      shouldFail ? Effect.fail(fail("deliberate failure")) : Effect.succeed("ok"),
    encode: (s) => s,
  });

  test("ctx.fail auto-fills tool name", async () => {
    const err = await Effect.runPromise(ctxTool.execute({ shouldFail: true }).pipe(Effect.flip));
    expect(err._tag).toBe("ToolError");
    expect((err as ToolError).tool).toBe("ctxDemo");
    expect((err as ToolError).message).toBe("deliberate failure");
  });

  test("success path still works", async () => {
    const result = await Effect.runPromise(ctxTool.execute({ shouldFail: false }));
    expect(result).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// ToolSafety
// ---------------------------------------------------------------------------

describe("compareToolSafety", () => {
  test("readonly < write < destructive", () => {
    expect(compareToolSafety("readonly", "write")).toBeLessThan(0);
    expect(compareToolSafety("write", "destructive")).toBeLessThan(0);
    expect(compareToolSafety("readonly", "destructive")).toBeLessThan(0);
  });

  test("equal levels return 0", () => {
    const levels: ToolSafety[] = ["readonly", "write", "destructive"];
    for (const level of levels) {
      expect(compareToolSafety(level, level)).toBe(0);
    }
  });

  test("higher > lower", () => {
    expect(compareToolSafety("destructive", "readonly")).toBeGreaterThan(0);
  });
});

describe("toolsWithMaxSafety", () => {
  const tools: ReadonlyArray<ToolAny> = [readTool, writeTool, deleteTool];

  test("readonly filters to only readonly tools", () => {
    const filtered = toolsWithMaxSafety(tools, "readonly");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe("readFile");
  });

  test("write includes readonly and write tools", () => {
    const filtered = toolsWithMaxSafety(tools, "write");
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).toEqual(["readFile", "writeFile"]);
  });

  test("destructive includes all tools", () => {
    const filtered = toolsWithMaxSafety(tools, "destructive");
    expect(filtered).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Capability helpers
// ---------------------------------------------------------------------------

describe("toolCapabilities", () => {
  const tools: ReadonlyArray<ToolAny> = [readTool, writeTool];

  test("extracts unique capabilities from tool array", () => {
    const caps = toolCapabilities(tools);
    expect(caps).toContain("fs.read");
    expect(caps).toContain("fs.write");
    expect(caps.filter((c) => c === "fs.read")).toHaveLength(1);
  });

  test("returns empty array for empty tool list", () => {
    expect(toolCapabilities([])).toEqual([]);
  });
});

describe("toolHasCapability", () => {
  const tools: ReadonlyArray<ToolAny> = [readTool, writeTool];

  test("returns true when capability exists", () => {
    expect(toolHasCapability(tools, "fs.write")).toBe(true);
  });

  test("returns false when capability missing", () => {
    expect(toolHasCapability([readTool], "fs.write")).toBe(false);
  });
});

describe("toolsWithoutCapability", () => {
  const tools: ReadonlyArray<ToolAny> = [readTool, writeTool];

  test("filters out tools with the given capability", () => {
    const filtered = toolsWithoutCapability(tools, "fs.write");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe("readFile");
  });

  test("returns all tools when none have the capability", () => {
    const filtered = toolsWithoutCapability(tools, "network");
    expect(filtered).toHaveLength(2);
  });
});
