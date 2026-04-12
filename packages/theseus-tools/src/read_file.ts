/**
 * read_file — Read file contents with offset/limit.
 *
 * Uses Bun.file() for lazy loading, MIME type binary detection, and size pre-check.
 * Returns line-numbered content with truncation indicator.
 *
 * Effect.gen pipeline: exists check → binary detection → read → format.
 * Distinct errors: not-found (fail), binary (succeed with info), read error (fail).
 */

import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { z } from "zod";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

/** MIME types we treat as text even though they don't start with "text/" */
const TEXT_MIMES = ["json", "xml", "javascript", "typescript", "ecmascript"];

const inputSchema = z.object({
  path: z.string().min(1),
  offset: z.number().int().min(1).optional().describe("Start at this line number (1-indexed)"),
  limit: z.number().int().min(1).optional().describe("Max lines to return (default 2000)"),
});

type Input = z.infer<typeof inputSchema>;

export const readFile = Tool.define<Input, string>({
  name: "read_file",
  description:
    "Read a file. Returns line-numbered text. Binary files return a type indicator. Use offset/limit for large files.",
  inputSchema: Tool.fromZod(inputSchema),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path, offset, limit }, { fail }) =>
    Effect.gen(function* () {
      const file = Bun.file(path);

      // Step 1: existence check
      const exists = yield* Effect.tryPromise({
        try: () => file.exists(),
        catch: (e) => fail(`Cannot access ${path}: ${e}`),
      });
      if (!exists) return yield* Effect.fail(fail(`File not found: ${path}`));

      // Step 2: binary detection via MIME type
      const mime = file.type;
      if (mime && !mime.startsWith("text/") && !TEXT_MIMES.some((t) => mime.includes(t))) {
        return `Binary file (${mime}, ${file.size} bytes)`;
      }

      // Step 3: read content
      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (e) => fail(`Cannot read ${path}: ${e}`),
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
  encode: (s) => s,
});
