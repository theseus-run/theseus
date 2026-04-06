/**
 * glob — Find files by glob pattern.
 *
 * Uses Bun.Glob (native Zig-backed scanner). Caps at 100 results.
 */

import { Glob } from "bun";
import { Effect } from "effect";
import { defineTool, fromZod } from "@theseus.run/core";
import { z } from "zod";

const MAX_RESULTS = 100;

const inputSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
});

type Input = z.infer<typeof inputSchema>;

export const glob = defineTool<Input, string>({
  name: "glob",
  description:
    "Find files matching a glob pattern (e.g. **/*.ts, src/**/*.test.ts). Returns up to 100 file paths. Respects common ignore patterns.",
  inputSchema: fromZod(inputSchema),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ pattern, path }, { fail }) =>
    Effect.tryPromise({
      try: async () => {
        const g = new Glob(pattern);
        const root = path ?? ".";
        const results: string[] = [];

        for await (const file of g.scan({ cwd: root, onlyFiles: true, dot: false })) {
          // Skip noise directories
          if (
            file.includes("node_modules/") ||
            file.includes(".git/") ||
            file.includes("dist/") ||
            file.includes("coverage/")
          ) {
            continue;
          }
          results.push(file);
          if (results.length >= MAX_RESULTS) break;
        }

        if (results.length === 0) return "No files found";

        const output = results.join("\n");
        if (results.length >= MAX_RESULTS) {
          return `${output}\n[capped at ${MAX_RESULTS} results]`;
        }
        return output;
      },
      catch: (e) => fail(`Glob failed for "${pattern}": ${e}`),
    }),
  encode: (s) => s,
});
