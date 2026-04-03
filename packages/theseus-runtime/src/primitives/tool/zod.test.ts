import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { z } from "zod";
import { defineTool } from "./index.ts";
import { fromZod } from "./zod.ts";

describe("fromZod", () => {
  test("generates JSON schema from Zod object", () => {
    const adapter = fromZod(z.object({ path: z.string() }));
    expect(adapter.json).toHaveProperty("type", "object");
    expect(adapter.json).toHaveProperty("properties");
    const props = adapter.json["properties"] as Record<string, unknown>;
    expect(props).toHaveProperty("path");
  });

  test("decode parses valid input", () => {
    const adapter = fromZod(z.object({ a: z.number(), b: z.number() }));
    const result = adapter.decode({ a: 1, b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("decode throws on invalid input", () => {
    const adapter = fromZod(z.object({ path: z.string() }));
    expect(() => adapter.decode({ path: 123 })).toThrow();
  });

  test("works end-to-end with defineTool", async () => {
    const tool = defineTool({
      name: "greet",
      description: "Greet someone",
      inputSchema: fromZod(z.object({ name: z.string() })),
      outputSchema: fromZod(z.object({ greeting: z.string() })),
      safety: "readonly",
      capabilities: [],
      execute: ({ name }, _ctx) => Effect.succeed({ greeting: `hello ${name}` }),
      encode: (o) => o.greeting,
    });

    expect(tool.name).toBe("greet");
    expect(tool.inputSchema).toHaveProperty("type", "object");
    expect(tool.outputSchema).toHaveProperty("type", "object");
    const decoded = await Effect.runPromise(tool.decode({ name: "world" }));
    expect(decoded.name).toBe("world");
    const output = await Effect.runPromise(tool.execute(decoded));
    const validated = await Effect.runPromise(tool.validate?.(output));
    expect(validated.greeting).toBe("hello world");
    const encoded = await Effect.runPromise(tool.encode(output));
    expect(encoded).toBe("hello world");
  });

  test("validate rejects invalid output", async () => {
    const tool = defineTool({
      name: "typed",
      description: "Typed output",
      inputSchema: fromZod(z.object({ x: z.number() })),
      outputSchema: fromZod(z.object({ result: z.number() })),
      safety: "readonly",
      capabilities: [],
      execute: ({ x }, _ctx) => Effect.succeed({ result: x * 2 }),
      encode: (o) => String(o.result),
    });

    const ok = await Effect.runPromise(tool.validate?.({ result: 42 }));
    expect(ok).toEqual({ result: 42 });

    // biome-ignore lint/suspicious/noExplicitAny: intentionally testing bad output
    const err = await Effect.runPromise(
      tool.validate?.({ result: "not a number" } as any).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolErrorOutput");
  });

  test("handles optional fields", () => {
    const adapter = fromZod(
      z.object({
        required: z.string(),
        optional: z.string().optional(),
      }),
    );
    const props = adapter.json["properties"] as Record<string, unknown>;
    expect(props).toHaveProperty("required");
    expect(props).toHaveProperty("optional");

    expect(adapter.decode({ required: "yes" })).toEqual({ required: "yes" });
    expect(adapter.decode({ required: "yes", optional: "also" })).toEqual({
      required: "yes",
      optional: "also",
    });
  });
});
