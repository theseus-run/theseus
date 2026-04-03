import { Effect } from "effect";
import { describe, expect, test } from "bun:test";
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
      serialize: (o) => o.greeting,
    });

    expect(tool.name).toBe("greet");
    expect(tool.inputSchema.json).toHaveProperty("type", "object");
    expect(tool.outputSchema?.json).toHaveProperty("type", "object");
    const decoded = tool.inputSchema.decode({ name: "world" });
    expect(decoded.name).toBe("world");
    const output = await Effect.runPromise(tool.execute(decoded));
    const validated = tool.outputSchema!.decode(output);
    expect(validated.greeting).toBe("hello world");
    expect(tool.serialize(output)).toBe("hello world");
  });

  test("outputSchema.decode rejects invalid output", () => {
    const tool = defineTool({
      name: "typed",
      description: "Typed output",
      inputSchema: fromZod(z.object({ x: z.number() })),
      outputSchema: fromZod(z.object({ result: z.number() })),
      safety: "readonly",
      capabilities: [],
      execute: ({ x }, _ctx) => Effect.succeed({ result: x * 2 }),
      serialize: (o) => String(o.result),
    });

    expect(tool.outputSchema!.decode({ result: 42 })).toEqual({ result: 42 });
    expect(() => tool.outputSchema!.decode({ result: "not a number" })).toThrow();
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
