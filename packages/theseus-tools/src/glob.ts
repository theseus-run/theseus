/**
 * glob — Find files by glob pattern.
 *
 * Uses Bun.Glob (native Zig-backed scanner). Caps at 100 results.
 */

import * as Tool from "@theseus.run/core/Tool";
import { Glob } from "bun";
import { Effect, Schema } from "effect";
import { ToolFailure } from "./failure.ts";

const MAX_RESULTS = 100;

const Input = Schema.Struct({
  pattern: Schema.String,
  path: Schema.optional(
    Schema.String.annotate({
      description: "Root directory to scan (default: cwd)",
    }),
  ),
});

export const glob = Tool.defineTool({
  name: "glob",
  description:
    "Find files by glob pattern (e.g. **/*.ts, src/**/*.test.ts). Returns ≤100 paths. Skips node_modules, .git, dist, coverage.",
  input: Input,
  output: Tool.Defaults.TextOutput,
  failure: ToolFailure,
  policy: { interaction: "observe" },
  execute: ({ pattern, path }) =>
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
      catch: (e) => new ToolFailure({ message: `Glob failed for "${pattern}": ${e}` }),
    }),
});
