/**
 * outline — Extract symbols from source files using tree-sitter.
 *
 * Uses web-tree-sitter (WASM) for fast, accurate parsing.
 * Outputs one line per symbol: `line:col  kind  name  signature`
 * 60-80% token savings vs read_file for structural understanding.
 *
 * Languages: TypeScript, TSX, JavaScript, Python, Go, Rust (extensible).
 */

import { Effect, Match } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { z } from "zod";
import { extname } from "node:path";

import { parse } from "./tree-sitter.ts";
import { formatSymbols } from "./symbol.ts";
import { extractSymbolsTS } from "./lang-ts.ts";
import { extractSymbolsPython } from "./lang-python.ts";
import { extractSymbolsGo } from "./lang-go.ts";
import { extractSymbolsRust } from "./lang-rust.ts";

import type { TreeSitterNode } from "./tree-sitter.ts";
import type { Symbol } from "./symbol.ts";

// ---------------------------------------------------------------------------
// Extension → grammar mapping
// ---------------------------------------------------------------------------

export const EXT_TO_GRAMMAR: Record<string, string> = {
  ".ts": "tree-sitter-typescript",
  ".tsx": "tree-sitter-tsx",
  ".js": "tree-sitter-javascript",
  ".jsx": "tree-sitter-javascript",
  ".mts": "tree-sitter-typescript",
  ".cts": "tree-sitter-typescript",
  ".mjs": "tree-sitter-javascript",
  ".cjs": "tree-sitter-javascript",
  ".py": "tree-sitter-python",
  ".go": "tree-sitter-go",
  ".rs": "tree-sitter-rust",
};

export const SUPPORTED_EXTS = new Set(Object.keys(EXT_TO_GRAMMAR));

// ---------------------------------------------------------------------------
// Grammar → extractor dispatch
// ---------------------------------------------------------------------------

const extractSymbols = (root: TreeSitterNode, grammar: string): Symbol[] =>
  Match.value(grammar).pipe(
    Match.when("tree-sitter-typescript", () => extractSymbolsTS(root)),
    Match.when("tree-sitter-tsx", () => extractSymbolsTS(root)),
    Match.when("tree-sitter-javascript", () => extractSymbolsTS(root)),
    Match.when("tree-sitter-python", () => extractSymbolsPython(root)),
    Match.when("tree-sitter-go", () => extractSymbolsGo(root)),
    Match.when("tree-sitter-rust", () => extractSymbolsRust(root)),
    Match.orElse(() => extractSymbolsTS(root)),
  );

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  path: z.string().min(1),
});

type Input = z.infer<typeof inputSchema>;

export const outline = Tool.define<Input, string>({
  name: "outline",
  description:
    "Extract symbol outline from a source file (functions, classes, types, imports). Uses tree-sitter for fast, accurate parsing. Much cheaper than read_file for structural understanding.",
  inputSchema: Tool.fromZod(inputSchema),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path }, { fail }) =>
    Effect.gen(function* () {
      const file = Bun.file(path);

      // Existence check
      const exists = yield* Effect.tryPromise({
        try: () => file.exists(),
        catch: (e) => fail(`Cannot access ${path}: ${e}`),
      });
      if (!exists) return yield* Effect.fail(fail(`File not found: ${path}`));

      // Extension check
      const ext = extname(path).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) {
        return yield* Effect.fail(
          fail(`Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_EXTS].join(", ")}`),
        );
      }

      // Binary detection
      const mime = file.type;
      if (mime && !mime.startsWith("text/") && !mime.includes("javascript") && !mime.includes("typescript")) {
        return `Binary file (${mime}, ${file.size} bytes)`;
      }

      // Read content
      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (e) => fail(`Cannot read ${path}: ${e}`),
      });

      if (content.trim().length === 0) return "Empty file";

      // Parse with tree-sitter
      const grammarName = EXT_TO_GRAMMAR[ext]!;
      const tree = yield* parse(content, grammarName, fail);

      const symbols = extractSymbols(tree.rootNode, grammarName);
      return formatSymbols(symbols);
    }),
  encode: (s) => s,
});

// Re-export types for consumers
export type { Symbol } from "./symbol.ts";
export type { TreeSitterNode, TreeSitterTree } from "./tree-sitter.ts";
