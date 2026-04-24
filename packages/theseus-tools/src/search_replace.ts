/**
 * search_replace — Exact-string replacement in a file.
 *
 * Uses Bun.file() + Bun.write(). Exact match first, then whitespace-normalized fallback.
 * Returns context around the edit site.
 */

import * as Tool from "@theseus.run/core/Tool";
import { Effect, Schema } from "effect";
import { ToolFailure } from "./failure.ts";

const CONTEXT_LINES = 4;

const Input = Schema.Struct({
  path: Schema.String,
  old: Schema.String.annotate({ description: "Text to find — must match exactly once" }),
  new: Schema.String.annotate({ description: "Replacement text (empty string to delete)" }),
});

type Input = Schema.Schema.Type<typeof Input>;

/** Find the position of `needle` in `haystack` using whitespace-normalized comparison. */
const fuzzyFind = (
  haystack: string,
  needle: string,
): { start: number; end: number } | undefined => {
  const haystackLines = haystack.split("\n");
  const needleLines = needle.split("\n");
  const needleNorm = needleLines.map((l) => l.replace(/\s+/g, " ").trim());

  for (let i = 0; i <= haystackLines.length - needleLines.length; i++) {
    let match = true;
    for (let j = 0; j < needleLines.length; j++) {
      const haystackLine = haystackLines[i + j];
      const needleLine = needleNorm[j];
      if (haystackLine === undefined || needleLine === undefined) {
        match = false;
        break;
      }
      const hNorm = haystackLine.replace(/\s+/g, " ").trim();
      if (hNorm !== needleLine) {
        match = false;
        break;
      }
    }
    if (match) {
      const start = haystackLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      const end =
        haystackLines.slice(0, i + needleLines.length).join("\n").length + (i > 0 ? 1 : 0);
      const matchedText = haystackLines.slice(i, i + needleLines.length).join("\n");
      const startPos = haystack.indexOf(matchedText);
      if (startPos !== -1) {
        return { start: startPos, end: startPos + matchedText.length };
      }
      return { start, end };
    }
  }
  return undefined;
};

export const searchReplace = Tool.define<Input, string, ToolFailure>({
  name: "search_replace",
  description:
    "Replace text in a file. Exact match first, whitespace-normalized fallback. Errors if old text matches in multiple places.",
  input: Input as unknown as Schema.Schema<Input>,
  failure: ToolFailure as unknown as Schema.Schema<ToolFailure>,
  policy: { interaction: "write" },
  execute: ({ path, old: oldText, new: newText }) =>
    Effect.tryPromise({
      try: async () => {
        const file = Bun.file(path);
        if (!(await file.exists())) throw new Error("File not found");

        const content = await file.text();

        let result: string;
        let matchType: string;

        const idx = content.indexOf(oldText);
        if (idx !== -1) {
          const secondIdx = content.indexOf(oldText, idx + 1);
          if (secondIdx !== -1) {
            throw new Error(
              `Multiple matches found (at least 2). Provide more context in 'old' to uniquely identify the replacement site.`,
            );
          }
          result = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
          matchType = "exact";
        } else {
          const fuzzy = fuzzyFind(content, oldText);
          if (!fuzzy) {
            throw new Error(
              `Text not found in ${path}. Verify the 'old' text matches the file content exactly.`,
            );
          }
          result = content.slice(0, fuzzy.start) + newText + content.slice(fuzzy.end);
          matchType = "whitespace-normalized";
        }

        await Bun.write(path, result);

        const lines = result.split("\n");
        const editStart = result.indexOf(newText);
        const editLine = editStart === -1 ? 0 : result.slice(0, editStart).split("\n").length - 1;
        const editEndLine = editLine + (newText === "" ? 0 : newText.split("\n").length - 1);

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
      catch: (e) => new ToolFailure({ message: `${e}` }),
    }),
});
