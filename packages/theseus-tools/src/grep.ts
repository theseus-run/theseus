/**
 * grep — Regex search across file contents.
 *
 * Uses ripgrep via Bun.$ with --json for structured output.
 * Exit codes: 0 = matches, 1 = no matches, 2 = error.
 */

import * as Tool from "@theseus.run/core/Tool";
import { $ } from "bun";
import { Effect, Schedule, Schema } from "effect";
import { ToolFailure } from "./failure.ts";

const MAX_MATCHES = 100;

const Input = Schema.Struct({
  pattern: Schema.String,
  path: Schema.optional(
    Schema.String.annotate({ description: "Root directory or file to search (default: cwd)" }),
  ),
  glob: Schema.optional(Schema.String.annotate({ description: "File filter pattern (e.g. *.ts)" })),
  context_lines: Schema.optional(
    Schema.Int.annotate({ description: "Lines of context around each match (0-10)" }),
  ),
});

type Input = Schema.Schema.Type<typeof Input>;

interface GrepMatch {
  readonly file: string;
  readonly line: number;
  readonly content: string;
}

const parseRgJson = (raw: string): GrepMatch[] => {
  const matches: GrepMatch[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === "match") {
        matches.push({
          file: obj.data.path.text,
          line: obj.data.line_number,
          content: obj.data.lines.text.trimEnd(),
        });
      }
    } catch {
      // Skip malformed JSON lines
    }
  }
  return matches;
};

const formatMatches = (matches: GrepMatch[], total: number): string => {
  if (matches.length === 0) return "No matches found";

  // Group by file
  const byFile = new Map<string, GrepMatch[]>();
  for (const m of matches) {
    const existing = byFile.get(m.file);
    if (existing) existing.push(m);
    else byFile.set(m.file, [m]);
  }

  const parts: string[] = [];
  for (const [file, fileMatches] of byFile) {
    parts.push(file);
    for (const m of fileMatches) {
      parts.push(`  ${m.line}: ${m.content}`);
    }
  }

  if (total > matches.length) {
    parts.push(`\n[showing ${matches.length} of ${total} matches]`);
  }

  return parts.join("\n");
};

export const grep = Tool.define<Input, string, ToolFailure>({
  name: "grep",
  description:
    "Search file contents by regex. Returns matches grouped by file (file:line:content). ≤100 matches.",
  input: Input as unknown as Schema.Schema<Input>,
  failure: ToolFailure as unknown as Schema.Schema<ToolFailure>,
  policy: { interaction: "observe" },
  // Retry transient ripgrep-not-found once (binary may have been installed concurrently).
  retry: Schedule.recurs(1) as unknown as Schedule.Schedule<unknown>,
  execute: ({ pattern, path, glob: globPattern, context_lines }) => {
    // Build ripgrep args
    const args = ["rg", "--json", "--max-count", "10", "--sort", "modified"];

    if (globPattern) args.push("--glob", globPattern);
    if (context_lines !== undefined && context_lines > 0) {
      args.push("-C", String(context_lines));
    }

    args.push("--", pattern, path ?? ".");

    // Run ripgrep
    const run = Effect.tryPromise({
      try: () => $`${args}`.nothrow().quiet(),
      catch: (e) => new ToolFailure({ message: `Grep failed: ${e}` }),
    });

    return run.pipe(
      Effect.flatMap((result) => {
        const exitCode = result.exitCode;

        // Exit code 2 = ripgrep error (bad regex, permission denied, etc.)
        if (exitCode === 2) {
          const stderr = result.stderr.toString().trim();
          return Effect.fail(new ToolFailure({ message: `ripgrep error: ${stderr}` }));
        }

        // Exit code 1 = no matches (not an error)
        // Exit code 0 = matches found
        const raw = result.stdout.toString();
        const allMatches = parseRgJson(raw);
        const capped = allMatches.slice(0, MAX_MATCHES);

        return Effect.succeed(formatMatches(capped, allMatches.length));
      }),
    );
  },
});
