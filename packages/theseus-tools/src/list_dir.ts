/**
 * list_dir — List directory contents with noise filtering.
 *
 * Uses node:fs readdir (Bun's fast implementation).
 * Filters common noise directories, indicates entry types.
 */

import { readdir } from "node:fs/promises";
import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { z } from "zod";

const NOISE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  "zig-cache",
  "zig-out",
  ".DS_Store",
]);

const inputSchema = z.object({
  path: z.string().min(1),
});

type Input = z.infer<typeof inputSchema>;

export const listDir = Tool.define<Input, string>({
  name: "list_dir",
  description:
    "List directory contents. Dirs end with /, symlinks with @. Skips node_modules, .git, dist, build, coverage.",
  inputSchema: Tool.fromZod(inputSchema),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path }, { fail }) =>
    Effect.tryPromise({
      try: async () => {
        const entries = await readdir(path, { withFileTypes: true });
        const filtered = entries.filter((e) => !NOISE.has(e.name));

        // Sort: directories first, then files, alphabetical within each group
        filtered.sort((a, b) => {
          const aDir = a.isDirectory() ? 0 : 1;
          const bDir = b.isDirectory() ? 0 : 1;
          if (aDir !== bDir) return aDir - bDir;
          return a.name.localeCompare(b.name);
        });

        return filtered
          .map((e) => {
            if (e.isDirectory()) return `${e.name}/`;
            if (e.isSymbolicLink()) return `${e.name}@`;
            return e.name;
          })
          .join("\n");
      },
      catch: (e) => fail(`Cannot list ${path}: ${e}`),
    }),
  encode: (s) => s,
});
