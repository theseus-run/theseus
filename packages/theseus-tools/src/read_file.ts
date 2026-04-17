/**
 * read_file — Read file contents with offset/limit.
 *
 * Uses Bun.file() for lazy loading, MIME type binary detection, and size pre-check.
 * Returns line-numbered content with truncation indicator.
 *
 * Effect.gen pipeline: exists check → binary detection → read → format.
 * Distinct errors: not-found (fail), binary (succeed with info), read error (fail).
 */

import { Effect, Schema } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { ToolFailure } from "./failure.ts";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

/** MIME types we treat as text even though they don't start with "text/" */
const TEXT_MIMES = ["json", "xml", "javascript", "typescript", "ecmascript"];

const Input = Schema.Struct({
  path: Schema.String,
  offset: Schema.optional(
    Schema.Int.annotate({ description: "Start at this line number (1-indexed)" }),
  ),
  limit: Schema.optional(
    Schema.Int.annotate({ description: "Max lines to return (default 2000)" }),
  ),
});

type Input = Schema.Schema.Type<typeof Input>;

export const readFile = Tool.define<Input, string, ToolFailure>({
  name: "read_file",
  description:
    "Read a file. Returns line-numbered text. Binary files return a type indicator. Use offset/limit for large files.",
  input: Input as unknown as Schema.Schema<Input>,
  failure: ToolFailure as unknown as Schema.Schema<ToolFailure>,
  meta: Tool.meta({ mutation: "readonly", capabilities: ["fs.read"] }),
  execute: ({ path, offset, limit }) =>
    Effect.gen(function* () {
      const file = Bun.file(path);

      // Step 1: existence check
      const exists = yield* Effect.tryPromise({
        try: () => file.exists(),
        catch: (e) => new ToolFailure({ message: `Cannot access ${path}: ${e}` }),
      });
      if (!exists) {
        return yield* Effect.fail(new ToolFailure({ message: `File not found: ${path}` }));
      }

      // Step 2: binary detection via MIME type
      const mime = file.type;
      if (mime && !mime.startsWith("text/") && !TEXT_MIMES.some((t) => mime.includes(t))) {
        return `Binary file (${mime}, ${file.size} bytes)`;
      }

      // Step 3: read content
      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (e) => new ToolFailure({ message: `Cannot read ${path}: ${e}` }),
      });

      // Step 4: slice and format
      const allLines = content.split("\n");
      const totalLines = allLines.length;

      const start = (offset ?? 1) - 1;
      const cap = limit ?? MAX_LINES;
      const end = Math.min(start + cap, totalLines);
      const lines = allLines.slice(start, end);

      const padWidth = String(end).length;
      const formatted = lines
        .map((line, i) => {
          const lineNum = String(start + i + 1).padStart(padWidth, " ");
          const truncated =
            line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}...` : line;
          return `${lineNum}\t${truncated}`;
        })
        .join("\n");

      if (end < totalLines) {
        return `[${start + 1}-${end} of ${totalLines} lines]\n${formatted}\n[truncated — use offset/limit for remaining ${totalLines - end} lines]`;
      }
      return formatted;
    }),
});
