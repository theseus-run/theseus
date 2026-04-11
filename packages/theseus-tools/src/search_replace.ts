/**
 * search_replace — Exact-string replacement in a file.
 *
 * Uses Bun.file() + Bun.write(). Exact match first, then whitespace-normalized fallback.
 * Returns context around the edit site.
 */

import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { z } from "zod";

const CONTEXT_LINES = 4;

const inputSchema = z.object({
  path: z.string().min(1),
  old: z.string().min(1),
  new: z.string(),
});

type Input = z.infer<typeof inputSchema>;

/** Find the position of `needle` in `haystack` using whitespace-normalized comparison. */
const fuzzyFind = (
  haystack: string,
  needle: string,
): { start: number; end: number } | null => {
  const haystackLines = haystack.split("\n");
  const needleLines = needle.split("\n");
  const needleNorm = needleLines.map((l) => l.replace(/\s+/g, " ").trim());

  for (let i = 0; i <= haystackLines.length - needleLines.length; i++) {
    let match = true;
    for (let j = 0; j < needleLines.length; j++) {
      const hNorm = haystackLines[i + j]!.replace(/\s+/g, " ").trim();
      if (hNorm !== needleNorm[j]!) {
        match = false;
        break;
      }
    }
    if (match) {
      // Calculate character positions
      const start = haystackLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      const end =
        haystackLines.slice(0, i + needleLines.length).join("\n").length +
        (i > 0 ? 1 : 0);
      // Adjust: we want to use original line positions
      const matchedText = haystackLines.slice(i, i + needleLines.length).join("\n");
      const startPos = haystack.indexOf(matchedText);
      if (startPos !== -1) {
        return { start: startPos, end: startPos + matchedText.length };
      }
      return { start, end };
    }
  }
  return null;
};

export const searchReplace = Tool.define<Input, string>({
  name: "search_replace",
  description:
    "Replace exact text in a file. Finds `old` text and replaces with `new` text. Falls back to whitespace-normalized matching if exact match fails.",
  inputSchema: Tool.fromZod(inputSchema),
  safety: "write",
  capabilities: ["fs.write"],
  execute: ({ path, old: oldText, new: newText }, { fail }) =>
    Effect.tryPromise({
      try: async () => {
        const file = Bun.file(path);
        if (!(await file.exists())) throw new Error("File not found");

        const content = await file.text();

        let result: string;
        let matchType: string;

        // Try exact match first
        const idx = content.indexOf(oldText);
        if (idx !== -1) {
          // Ensure unique match
          const secondIdx = content.indexOf(oldText, idx + 1);
          if (secondIdx !== -1) {
            throw new Error(
              `Multiple matches found (at least 2). Provide more context in 'old' to uniquely identify the replacement site.`,
            );
          }
          result = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
          matchType = "exact";
        } else {
          // Try whitespace-normalized fallback
          const fuzzy = fuzzyFind(content, oldText);
          if (!fuzzy) {
            throw new Error(
              `Text not found in ${path}. Verify the 'old' text matches the file content exactly.`,
            );
          }
          result =
            content.slice(0, fuzzy.start) + newText + content.slice(fuzzy.end);
          matchType = "whitespace-normalized";
        }

        await Bun.write(path, result);

        // Build context around edit site
        const lines = result.split("\n");
        const editStart = result.indexOf(newText);
        const editLine =
          editStart === -1
            ? 0
            : result.slice(0, editStart).split("\n").length - 1;
        const editEndLine =
          editLine + (newText === "" ? 0 : newText.split("\n").length - 1);

        const ctxStart = Math.max(0, editLine - CONTEXT_LINES);
        const ctxEnd = Math.min(lines.length, editEndLine + CONTEXT_LINES + 1);
        const padWidth = String(ctxEnd).length;
        const context = lines
          .slice(ctxStart, ctxEnd)
          .map((line, i) => {
            const lineNum = String(ctxStart + i + 1).padStart(padWidth, " ");
            return `${lineNum}\t${line}`;
          })
          .join("\n");

        return `Replaced 1 occurrence (${matchType}) in ${path}\n\n${context}`;
      },
      catch: (e) => fail(`${e}`),
    }),
  encode: (s) => s,
});
