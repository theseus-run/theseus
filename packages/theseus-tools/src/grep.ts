/**
 * grep — Regex search across file contents.
 *
 * Uses ripgrep via Bun.$ with --json for structured output.
 * ripgrep-not-found is retriable (agent can retry or fallback).
 * Exit codes: 0 = matches, 1 = no matches, 2 = error.
 */

import { $ } from "bun";
import { Effect } from "effect";
import { defineTool, fromZod } from "@theseus.run/core";
import { z } from "zod";

const MAX_MATCHES = 100;

const inputSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  glob: z.string().optional(),
  context_lines: z.number().int().min(0).max(10).optional(),
});

type Input = z.infer<typeof inputSchema>;

interface GrepMatch {
  file: string;
  line: number;
  content: string;
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

export const grep = defineTool<Input, string>({
  name: "grep",
  description:
    "Search file contents with a regex pattern. Returns file:line:content grouped by file. Uses ripgrep for speed.",
  inputSchema: fromZod(inputSchema),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ pattern, path, glob: globPattern, context_lines }, { fail, retriable }) => {
    // Build ripgrep args
    const args = [
      "rg",
      "--json",
      "--max-count", "10",
      "--sort", "modified",
    ];

    if (globPattern) args.push("--glob", globPattern);
    if (context_lines !== undefined && context_lines > 0) {
      args.push("-C", String(context_lines));
    }

    args.push("--", pattern, path ?? ".");

    // Run ripgrep
    const run = Effect.tryPromise({
      try: () => $`${args}`.nothrow().quiet(),
      catch: (e) => {
        const msg = String(e);
        // ripgrep not installed or not on PATH — retriable so runtime can retry
        if (msg.includes("not found") || msg.includes("ENOENT")) {
          return retriable("ripgrep (rg) not found on PATH. Install with: brew install ripgrep");
        }
        return fail(`Grep failed: ${e}`);
      },
    });

    return run.pipe(
      Effect.flatMap((result) => {
        const exitCode = result.exitCode;

        // Exit code 2 = ripgrep error (bad regex, permission denied, etc.)
        if (exitCode === 2) {
          const stderr = result.stderr.toString().trim();
          return Effect.fail(fail(`ripgrep error: ${stderr}`));
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
  encode: (s) => s,
});
