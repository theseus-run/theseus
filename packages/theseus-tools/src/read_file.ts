/**
 * read_file — Read file contents with offset/limit.
 *
 * Uses ToolPlatform for filesystem access.
 * Returns line-numbered content with truncation indicator.
 *
 * Effect.gen pipeline: exists check -> read -> format.
 * Distinct errors: not-found (fail), read error (fail).
 */

import * as Tool from "@theseus.run/core/Tool";
import { Effect, Schema } from "effect";
import { ToolFailure } from "./failure.ts";
import { ToolPlatform } from "./platform.ts";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

const Input = Schema.Struct({
  path: Schema.String,
  offset: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: "Start at this line number (1-indexed)",
    }),
  ),
  limit: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: "Max lines to return (default 2000)",
    }),
  ),
});

const ensureExists = (exists: boolean, path: string): Effect.Effect<void, ToolFailure> =>
  exists ? Effect.void : Effect.fail(new ToolFailure({ message: `File not found: ${path}` }));

const formatLine = (line: string): string => {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_LINE_LENGTH)}...`;
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

export const readFile = Tool.defineTool({
  name: "read_file",
  description:
    "Read a file. Returns line-numbered text. Binary files return a type indicator. Use offset/limit for large files.",
  input: Input,
  output: Tool.Defaults.TextOutput,
  failure: ToolFailure,
  policy: { interaction: "observe" },
  execute: ({ path, offset, limit }) =>
    Effect.gen(function* () {
      const platform = yield* ToolPlatform;
      const exists = yield* platform.exists(path);
      yield* ensureExists(exists, path);

      const content = yield* platform.readFileString(path);
      return formatContent(content, offset, limit);
    }),
});
