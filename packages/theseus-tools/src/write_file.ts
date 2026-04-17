/**
 * write_file — Create or overwrite a file.
 *
 * Uses Bun.write() for platform-optimal writes.
 * Creates parent directories automatically.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect, Schema } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { ToolFailure } from "./failure.ts";

const Input = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
});

type Input = Schema.Schema.Type<typeof Input>;

export const writeFile = Tool.define<Input, string, ToolFailure>({
  name: "write_file",
  description: "Create or overwrite a file. Creates parent directories automatically.",
  input: Input as unknown as Schema.Schema<Input>,
  failure: ToolFailure as unknown as Schema.Schema<ToolFailure>,
  meta: Tool.meta({ mutation: "write", capabilities: ["fs.write"] }),
  execute: ({ path, content }) =>
    Effect.tryPromise({
      try: async () => {
        const dir = dirname(path);
        await mkdir(dir, { recursive: true });
        await Bun.write(path, content);
        const lineCount = content.split("\n").length;
        return `Wrote ${lineCount} lines to ${path}`;
      },
      catch: (e) => new ToolFailure({ message: `Cannot write ${path}: ${e}` }),
    }),
});
