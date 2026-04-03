/**
 * Zod adapter for Tool — converts a Zod schema into a SchemaAdapter
 * for use with defineTool.
 *
 * Uses Zod 4's built-in z.toJSONSchema() — no extra packages.
 *
 *   const tool = defineTool({
 *     name: "readFile",
 *     description: "Read a file",
 *     inputSchema: fromZod(z.object({ path: z.string() })),
 *     safety: "readonly",
 *     retry: "idempotent",
 *     capabilities: ["fs.read"],
 *     tags: ["filesystem"],
 *     execute: ({ path }) => Effect.succeed(path),
 *     serialize: (s) => s,
 *   })
 */
import { z } from "zod";
import type { SchemaAdapter } from "./index.ts";

/** Convert a Zod schema into a SchemaAdapter for defineTool. */
export const fromZod = <T extends z.ZodType>(schema: T): SchemaAdapter<z.infer<T>> => ({
  json: z.toJSONSchema(schema, { target: "draft-07" }) as Record<string, unknown>,
  decode: (raw: unknown) => schema.parse(raw),
});
