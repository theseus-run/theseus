import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
import {
  type AnyTool,
  type Safety,
  capabilities,
  compareSafety,
  defineTool,
  hasCapability,
  manualSchema,
  ToolDeniedError,
  ToolExecutionError,
  ToolTransientError,
  toolErrors,
  withMaxSafety,
  withTag,
  withoutCapability,
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
  retry: "idempotent",
  capabilities: ["test.echo"],
  tags: ["test"],
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
  retry: "idempotent",
  capabilities: ["math"],
  tags: ["compute"],
  execute: ({ a, b }, _ctx) => Effect.succeed(a + b),
  serialize: (n) => String(n),
});

const failTool = defineTool({
  name: "fail",
  description: "Always fails with execution error",
  inputSchema: manualSchema(
    {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
    (raw) => raw as { reason: string },
  ),
  safety: "readonly",
  retry: "once",
  capabilities: ["test.fail"],
  tags: ["test"],
  execute: ({ reason }, { fail }) => Effect.fail(fail(reason)),
  serialize: () => "unreachable",
});

const transientTool = defineTool({
  name: "flaky",
  description: "Fails with transient error",
  inputSchema: manualSchema(
    { type: "object", properties: {}, required: [] },
    (raw) => raw as Record<string, never>,
  ),
  safety: "readonly",
  retry: "retriable",
  capabilities: [],
  tags: ["test"],
  execute: (_input, { transient }) =>
    Effect.fail(transient("rate limited", { retryAfter: "1 second" })),
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
  retry: "idempotent",
  capabilities: ["fs.read"],
  tags: ["filesystem"],
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
  retry: "retriable",
  capabilities: ["fs.read", "fs.write"],
  tags: ["filesystem"],
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
  retry: "once",
  capabilities: ["fs.write"],
  tags: ["filesystem"],
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
    expect(echoTool.retry).toBe("idempotent");
    expect(echoTool.tags).toEqual(["test"]);
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

describe("ToolExecutionError", () => {
  test("has correct _tag", async () => {
    const result = await Effect.runPromise(
      failTool.execute({ reason: "not found" }).pipe(
        Effect.flip, // flip so the error becomes the success value
      ),
    );
    expect(result._tag).toBe("ToolExecutionError");
    expect(result.tool).toBe("fail");
    expect(result.message).toBe("not found");
  });
});

describe("ToolTransientError", () => {
  test("has correct _tag and retryAfter", async () => {
    const result = await Effect.runPromise(
      transientTool.execute({} as never).pipe(Effect.flip),
    );
    expect(result._tag).toBe("ToolTransientError");
    expect(result.tool).toBe("flaky");
    expect((result as ToolTransientError).retryAfter).toBe("1 second");
  });
});

describe("ToolDeniedError", () => {
  test("can be constructed with reason", () => {
    const error = new ToolDeniedError({
      tool: "deleteFile",
      message: 'Safety "destructive" exceeds max "readonly"',
      reason: "safety",
    });
    expect(error._tag).toBe("ToolDeniedError");
    expect(error.reason).toBe("safety");
  });
});

describe("catchTags dispatches on error type", () => {
  test("catches ToolExecutionError specifically", async () => {
    const result = await Effect.runPromise(
      failTool.execute({ reason: "boom" }).pipe(
        Effect.catchTags({
          ToolExecutionError: (e) => Effect.succeed(`caught execution: ${e.message}`),
          ToolTransientError: () => Effect.succeed("caught transient"),
        }),
      ),
    );
    expect(result).toBe("caught execution: boom");
  });

  test("catches ToolTransientError specifically", async () => {
    const result = await Effect.runPromise(
      transientTool.execute({} as never).pipe(
        Effect.catchTags({
          ToolExecutionError: () => Effect.succeed("caught execution"),
          ToolTransientError: (e) => Effect.succeed(`caught transient: ${e.message}`),
        }),
      ),
    );
    expect(result).toBe("caught transient: rate limited");
  });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

describe("compareSafety", () => {
  test("readonly < write < destructive", () => {
    expect(compareSafety("readonly", "write")).toBeLessThan(0);
    expect(compareSafety("write", "destructive")).toBeLessThan(0);
    expect(compareSafety("readonly", "destructive")).toBeLessThan(0);
  });

  test("equal levels return 0", () => {
    const levels: Safety[] = ["readonly", "write", "destructive"];
    for (const level of levels) {
      expect(compareSafety(level, level)).toBe(0);
    }
  });

  test("higher > lower", () => {
    expect(compareSafety("destructive", "readonly")).toBeGreaterThan(0);
  });
});

describe("withMaxSafety", () => {
  const tools: ReadonlyArray<AnyTool> = [readTool, writeTool, deleteTool];

  test("readonly filters to only readonly tools", () => {
    const filtered = withMaxSafety(tools, "readonly");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("readFile");
  });

  test("write includes readonly and write tools", () => {
    const filtered = withMaxSafety(tools, "write");
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).toEqual(["readFile", "writeFile"]);
  });

  test("destructive includes all tools", () => {
    const filtered = withMaxSafety(tools, "destructive");
    expect(filtered).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

describe("withTag", () => {
  const tools: ReadonlyArray<AnyTool> = [echoTool, readTool, writeTool, addTool];

  test("filters by tag", () => {
    const fs = withTag(tools, "filesystem");
    expect(fs.map((t) => t.name)).toEqual(["readFile", "writeFile"]);
  });

  test("returns empty for unknown tag", () => {
    expect(withTag(tools, "network")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Capability helpers
// ---------------------------------------------------------------------------

describe("capabilities", () => {
  const tools: ReadonlyArray<AnyTool> = [readTool, writeTool];

  test("extracts unique capabilities from tool array", () => {
    const caps = capabilities(tools);
    expect(caps).toContain("fs.read");
    expect(caps).toContain("fs.write");
    expect(caps.filter((c) => c === "fs.read")).toHaveLength(1);
  });

  test("returns empty array for empty tool list", () => {
    expect(capabilities([])).toEqual([]);
  });
});

describe("hasCapability", () => {
  const tools: ReadonlyArray<AnyTool> = [readTool, writeTool];

  test("returns true when capability exists", () => {
    expect(hasCapability(tools, "fs.write")).toBe(true);
  });

  test("returns false when capability missing", () => {
    expect(hasCapability([readTool], "fs.write")).toBe(false);
  });
});

describe("withoutCapability", () => {
  const tools: ReadonlyArray<AnyTool> = [readTool, writeTool];

  test("filters out tools with the given capability", () => {
    const filtered = withoutCapability(tools, "fs.write");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("readFile");
  });

  test("returns all tools when none have the capability", () => {
    const filtered = withoutCapability(tools, "network");
    expect(filtered).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// toolErrors — standalone factory
// ---------------------------------------------------------------------------

describe("toolErrors", () => {
  test("creates ToolExecutionError with correct tool name", () => {
    const ctx = toolErrors("myTool");
    const err = ctx.fail("something went wrong");
    expect(err._tag).toBe("ToolExecutionError");
    expect(err.tool).toBe("myTool");
    expect(err.message).toBe("something went wrong");
  });

  test("creates ToolExecutionError with cause", () => {
    const ctx = toolErrors("myTool");
    const cause = new Error("underlying");
    const err = ctx.fail("wrapped", cause);
    expect(err.cause).toBe(cause);
  });

  test("creates ToolTransientError with retryAfter", () => {
    const ctx = toolErrors("myTool");
    const err = ctx.transient("rate limited", { retryAfter: "2 seconds" });
    expect(err._tag).toBe("ToolTransientError");
    expect(err.tool).toBe("myTool");
    expect(err.retryAfter).toBe("2 seconds");
  });
});

// ---------------------------------------------------------------------------
// ToolContext via defineTool — ctx is pre-bound
// ---------------------------------------------------------------------------

describe("ToolContext via defineTool", () => {
  const ctxTool = defineTool({
    name: "ctxDemo",
    description: "Demonstrates ToolContext usage",
    inputSchema: manualSchema(
      { type: "object", properties: { shouldFail: { type: "boolean" } }, required: ["shouldFail"] },
      (raw) => raw as { shouldFail: boolean },
    ),
    safety: "readonly",
    retry: "once",
    capabilities: [],
    tags: ["test"],
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
    expect(err._tag).toBe("ToolExecutionError");
    expect((err as ToolExecutionError).tool).toBe("ctxDemo");
    expect((err as ToolExecutionError).message).toBe("deliberate failure");
  });

  test("success path still works", async () => {
    const result = await Effect.runPromise(ctxTool.execute({ shouldFail: false }));
    expect(result).toBe("ok");
  });
});
