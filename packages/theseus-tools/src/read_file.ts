/**
 * read_file — Read file contents with offset/limit.
 *
 * Uses Bun.file() for lazy loading, MIME type binary detection, and size pre-check.
 * Returns line-numbered content with truncation indicator.
 *
 * Effect.gen pipeline: exists check → binary detection → read → format.
 * Distinct errors: not-found (fail), binary (succeed with info), read error (fail).
 */

import * as Tool from "@theseus.run/core/Tool";
import { Effect, Schema } from "effect";
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

const ensureExists = (exists: boolean, path: string): Effect.Effect<void, ToolFailure> =>
  exists ? Effect.void : Effect.fail(new ToolFailure({ message: `File not found: ${path}` }));

const formatLine = (line: string): string => {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_LINE_LENGTH)}...`;
};

const binaryDescription = (file: Pick<Bun.BunFile, "type" | "size">): string | undefined => {
  const mime = file.type;
  if (!mime || mime.startsWith("text/") || TEXT_MIMES.some((t) => mime.includes(t))) {
    return undefined;
  }
  return `Binary file (${mime}, ${file.size} bytes)`;
};

const formatContent = (content: string, offset?: number, limit?: number): string => {
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
      return `${lineNum}\t${formatLine(line)}`;
    })
    .join("\n");

  if (end < totalLines) {
    return `[${start + 1}-${end} of ${totalLines} lines]\n${formatted}\n[truncated - use offset/limit for remaining ${totalLines - end} lines]`;
  }
  return formatted;
};

const readTextFile = (
  file: Bun.BunFile,
  path: string,
  offset?: number,
  limit?: number,
): Effect.Effect<string, ToolFailure> => {
  const binary = binaryDescription(file);
  if (binary) return Effect.succeed(binary);

  return Effect.tryPromise({
    try: () => file.text(),
    catch: (e) => new ToolFailure({ message: `Cannot read ${path}: ${e}` }),
  }).pipe(Effect.map((content) => formatContent(content, offset, limit)));
};

export const readFile = Tool.defineTool<Input, string, ToolFailure>({
  name: "read_file",
  description:
    "Read a file. Returns line-numbered text. Binary files return a type indicator. Use offset/limit for large files.",
  input: Input as unknown as Schema.Schema<Input>,
  failure: ToolFailure as unknown as Schema.Schema<ToolFailure>,
  policy: { interaction: "observe" },
  execute: ({ path, offset, limit }) =>
    Effect.gen(function* () {
      const file = Bun.file(path);

      // Step 1: existence check
      const exists = yield* Effect.tryPromise({
        try: () => file.exists(),
        catch: (e) => new ToolFailure({ message: `Cannot access ${path}: ${e}` }),
      });
      yield* ensureExists(exists, path);

      return yield* readTextFile(file, path, offset, limit);
    }),
});
