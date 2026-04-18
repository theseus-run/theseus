/**
 * outline — Extract symbols from source files using tree-sitter.
 *
 * Uses web-tree-sitter (WASM) for fast, accurate parsing.
 * Outputs one line per symbol: `line:col  kind  name  signature`
 * 60-80% token savings vs read_file for structural understanding.
 *
 * Languages: TypeScript, TSX, JavaScript, Python, Go, Rust (extensible).
 */

import { extname } from "node:path";
import * as Tool from "@theseus.run/core/Tool";
import { Effect, Match, Schema } from "effect";
import { ToolFailure } from "../failure.ts";
import { extractSymbolsGo } from "./lang-go.ts";
import { extractSymbolsPython } from "./lang-python.ts";
import { extractSymbolsRust } from "./lang-rust.ts";
import { extractSymbolsTS } from "./lang-ts.ts";
import type { Symbol } from "./symbol.ts";
import { formatSymbols } from "./symbol.ts";

import type { TreeSitterNode } from "./tree-sitter.ts";
import { parse } from "./tree-sitter.ts";

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

const Input = Schema.Struct({
  path: Schema.String,
});

type Input = Schema.Schema.Type<typeof Input>;

export const outline = Tool.define<Input, string, ToolFailure>({
  name: "outline",
  description:
    "Extract symbol outline (functions, classes, types, imports) from a source file. Prefer over read_file for structural understanding. Supports: .ts .tsx .js .jsx .py .go .rs",
  input: Input as unknown as Schema.Schema<Input>,
  failure: ToolFailure as unknown as Schema.Schema<ToolFailure>,
  policy: { interaction: "observe" },
  execute: ({ path }) =>
    Effect.gen(function* () {
      const file = Bun.file(path);

      // Existence check
      const exists = yield* Effect.tryPromise({
        try: () => file.exists(),
        catch: (e) => new ToolFailure({ message: `Cannot access ${path}: ${e}` }),
      });
      if (!exists) {
        return yield* Effect.fail(new ToolFailure({ message: `File not found: ${path}` }));
      }

      // Extension check
      const ext = extname(path).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) {
        return yield* Effect.fail(
          new ToolFailure({
            message: `Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_EXTS].join(", ")}`,
          }),
        );
      }

      // Binary detection
      const mime = file.type;
      if (
        mime &&
        !mime.startsWith("text/") &&
        !mime.includes("javascript") &&
        !mime.includes("typescript")
      ) {
        return `Binary file (${mime}, ${file.size} bytes)`;
      }

      // Read content
      const content = yield* Effect.tryPromise({
        try: () => file.text(),
        catch: (e) => new ToolFailure({ message: `Cannot read ${path}: ${e}` }),
      });

      if (content.trim().length === 0) return "Empty file";

      // Parse with tree-sitter
      const grammarName = EXT_TO_GRAMMAR[ext]!;
      const tree = yield* parse(content, grammarName);

      const symbols = extractSymbols(tree.rootNode, grammarName);
      return formatSymbols(symbols);
    }),
});

// Re-export types for consumers
export type { Symbol } from "./symbol.ts";
export type { TreeSitterNode, TreeSitterTree } from "./tree-sitter.ts";
