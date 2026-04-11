/**
 * write_file — Create or overwrite a file.
 *
 * Uses Bun.write() for platform-optimal writes.
 * Creates parent directories automatically.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { z } from "zod";

const inputSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

type Input = z.infer<typeof inputSchema>;

export const writeFile = Tool.define<Input, string>({
  name: "write_file",
  description:
    "Create or overwrite a file with the given content. Creates parent directories if needed.",
  inputSchema: Tool.fromZod(inputSchema),
  safety: "write",
  capabilities: ["fs.write"],
  execute: ({ path, content }, { fail }) =>
    Effect.tryPromise({
      try: async () => {
        // Create parent directories
        const dir = dirname(path);
        await mkdir(dir, { recursive: true });

        await Bun.write(path, content);
        const lineCount = content.split("\n").length;
        return `Wrote ${lineCount} lines to ${path}`;
      },
      catch: (e) => fail(`Cannot write ${path}: ${e}`),
    }),
  encode: (s) => s,
});
