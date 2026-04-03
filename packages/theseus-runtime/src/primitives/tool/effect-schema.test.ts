import { Effect, Schema } from "effect";
import { describe, expect, test } from "bun:test";
import { defineTool } from "./index.ts";
import { fromEffectSchema } from "./effect-schema.ts";

describe("fromEffectSchema", () => {
  test("generates JSON schema from Effect Schema struct", () => {
    const adapter = fromEffectSchema(Schema.Struct({ path: Schema.String }));
    expect(adapter.json).toHaveProperty("type", "object");
    expect(adapter.json).toHaveProperty("properties");
    const props = adapter.json["properties"] as Record<string, unknown>;
    expect(props).toHaveProperty("path");
  });

  test("decode parses valid input", () => {
    const adapter = fromEffectSchema(Schema.Struct({ a: Schema.Number, b: Schema.Number }));
    const result = adapter.decode({ a: 1, b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test("decode throws on invalid input", () => {
    const adapter = fromEffectSchema(Schema.Struct({ path: Schema.String }));
    expect(() => adapter.decode({ path: 123 })).toThrow();
  });

  test("works end-to-end with defineTool", async () => {
    const tool = defineTool({
      name: "greet",
      description: "Greet someone",
      inputSchema: fromEffectSchema(Schema.Struct({ name: Schema.String })),
      safety: "readonly",
      capabilities: [],
      execute: ({ name }, _ctx) => Effect.succeed(`hello ${name}`),
      serialize: (s) => s,
    });

    expect(tool.name).toBe("greet");
    expect(tool.inputSchema.json).toHaveProperty("type", "object");
    const decoded = tool.inputSchema.decode({ name: "world" });
    expect(decoded.name).toBe("world");
    const output = await Effect.runPromise(tool.execute(decoded));
    expect(tool.serialize(output)).toBe("hello world");
  });

  test("handles optional fields", () => {
    const adapter = fromEffectSchema(
      Schema.Struct({
        required: Schema.String,
        optional: Schema.optional(Schema.String),
      }),
    );
    const props = adapter.json["properties"] as Record<string, unknown>;
    expect(props).toHaveProperty("required");

    expect(adapter.decode({ required: "yes" })).toHaveProperty("required", "yes");
    const both = adapter.decode({ required: "yes", optional: "also" });
    expect(both).toHaveProperty("required", "yes");
    expect(both).toHaveProperty("optional", "also");
  });

  test("includes required array in json", () => {
    const adapter = fromEffectSchema(
      Schema.Struct({ name: Schema.String, age: Schema.Number }),
    );
    expect(adapter.json).toHaveProperty("required");
    const req = adapter.json["required"] as string[];
    expect(req).toContain("name");
    expect(req).toContain("age");
  });
});
