import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import {
  type ToolAny,
  type ToolSafety,
  ToolError,
  ToolErrorInput,
  ToolErrorOutput,
  compareToolSafety,
  defineTool,
  manualSchema,
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
  serialize: (output) => output.echoed,
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
  serialize: (n) => String(n),
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
  serialize: () => "unreachable",
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
  execute: (_input, { retriable }) =>
    Effect.fail(retriable("rate limited")),
  serialize: () => "unreachable",
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
  serialize: (s) => s,
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
  serialize: (s) => s,
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
  serialize: (s) => s,
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

  test("inputSchema.json is a plain JSON schema object", () => {
    expect(echoTool.inputSchema.json).toEqual({
      type: "object",
      properties: { message: { type: "string", description: "Message to echo" } },
      required: ["message"],
    });
  });
});

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

describe("decode", () => {
  test("decodes valid input", () => {
    const input = echoTool.inputSchema.decode({ message: "hello" });
    expect(input.message).toBe("hello");
  });

  test("decodes multi-field input", () => {
    const input = addTool.inputSchema.decode({ a: 2, b: 3 });
    expect(input.a).toBe(2);
    expect(input.b).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// execute + serialize
// ---------------------------------------------------------------------------

describe("execute + serialize", () => {
  test("echo tool round-trips", async () => {
    const output = await Effect.runPromise(echoTool.execute({ message: "hello" }));
    expect(echoTool.serialize(output)).toBe("hello");
  });

  test("add tool computes and serializes", async () => {
    const output = await Effect.runPromise(addTool.execute({ a: 10, b: 32 }));
    expect(addTool.serialize(output)).toBe("42");
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
    const result = await Effect.runPromise(
      retriableTool.execute({} as never).pipe(Effect.flip),
    );
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
      shouldFail
        ? Effect.fail(fail("deliberate failure"))
        : Effect.succeed("ok"),
    serialize: (s) => s,
  });

  test("ctx.fail auto-fills tool name", async () => {
    const err = await Effect.runPromise(
      ctxTool.execute({ shouldFail: true }).pipe(Effect.flip),
    );
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
    expect(filtered[0]!.name).toBe("readFile");
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
    expect(filtered[0]!.name).toBe("readFile");
  });

  test("returns all tools when none have the capability", () => {
    const filtered = toolsWithoutCapability(tools, "network");
    expect(filtered).toHaveLength(2);
  });
});
