/**
 * Effect Schema adapter for Tool — converts an Effect Schema into
 * a SchemaAdapter for use with defineTool.
 *
 *   const tool = defineTool({
 *     name: "readFile",
 *     description: "Read a file",
 *     inputSchema: fromEffectSchema(Schema.Struct({ path: Schema.String })),
 *     safety: "readonly",
 *     capabilities: ["fs.read"],
 *     execute: ({ path }, { fail }) =>
 *       Effect.tryPromise(() => Bun.file(path).text()).pipe(
 *         Effect.mapError((e) => fail(`Cannot read: ${path}`, e)),
 *       ),
 *     serialize: (s) => s,
 *   })
 */
import { Schema } from "effect";
import type { SchemaAdapter } from "./index.ts";

/** Convert an Effect Schema into a SchemaAdapter for defineTool. */
export const fromEffectSchema = <I>(schema: Schema.Schema<I>): SchemaAdapter<I> => {
  // biome-ignore lint/suspicious/noExplicitAny: Effect v4 toJsonSchemaDocument needs Top constraint
  const doc = Schema.toJsonSchemaDocument(schema as any);
  const root = doc.schema as Record<string, unknown>;
  const defs = doc.definitions;

  // Inline $ref if definitions exist — most LLM APIs don't resolve $ref
  let properties = (root["properties"] as Record<string, unknown>) ?? {};
  const required = (root["required"] as ReadonlyArray<string>) ?? [];

  if (defs && Object.keys(defs).length > 0) {
    properties = inlineRefs(properties, defs);
  }

  return {
    json: { type: "object", properties, required },
    // biome-ignore lint/suspicious/noExplicitAny: Effect v4 decodeUnknownSync needs Top constraint
    decode: (raw: unknown) => Schema.decodeUnknownSync(schema as any)(raw) as I,
  };
};

/** Replace $ref pointers with inline definitions. */
const inlineRefs = (
  properties: Record<string, unknown>,
  definitions: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value && typeof value === "object" && "$ref" in value) {
      const ref = (value as { $ref: string }).$ref;
      const defName = ref.replace("#/$defs/", "");
      result[key] = definitions[defName] ?? value;
    } else {
      result[key] = value;
    }
  }
  return result;
};
