/**
 * Tree-sitter types, effectified loader, and parse pipeline.
 *
 * Module-level caches are process-lifetime singletons.
 */

import { Effect } from "effect";
import { ToolFailure } from "../failure.ts";

// ---------------------------------------------------------------------------
// Types for web-tree-sitter (CJS module)
// ---------------------------------------------------------------------------

export type TreeSitterParser = {
  new (): TreeSitterParserInstance;
  init(): Promise<void>;
};
export type TreeSitterLanguageInstance = { readonly _brand?: "Language" };
export type TreeSitterLanguageStatic = {
  load(path: string): Promise<TreeSitterLanguageInstance>;
};
export type TreeSitterParserInstance = {
  setLanguage(lang: TreeSitterLanguageInstance): void;
  parse(input: string): TreeSitterTree;
};
export type TreeSitterTree = {
  rootNode: TreeSitterNode;
};
export type TreeSitterNode = {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  childCount: number;
  child(index: number): TreeSitterNode | null;
  childForFieldName(name: string): TreeSitterNode | null;
};

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

let parserPromise: Promise<{
  Parser: TreeSitterParser;
  Language: TreeSitterLanguageStatic;
}> | null = null;
const languageCache = new Map<string, TreeSitterLanguageInstance>();

// ---------------------------------------------------------------------------
// Effectified loader
// ---------------------------------------------------------------------------

/** Lazily init tree-sitter WASM runtime (cached after first call). */
export const initTreeSitter = (): Effect.Effect<
  { Parser: TreeSitterParser; Language: TreeSitterLanguageStatic },
  ToolFailure
> =>
  Effect.tryPromise({
    try: () => {
      if (!parserPromise) {
        parserPromise = (async () => {
          const mod = require("web-tree-sitter") as {
            Parser: TreeSitterParser;
            Language: TreeSitterLanguageStatic;
          };
          await mod.Parser.init();
          return mod;
        })();
      }
      return parserPromise;
    },
    catch: (e) => new ToolFailure({ message: `Failed to initialize tree-sitter: ${e}` }),
  });

/** Load (and cache) a tree-sitter grammar by name. */
export const loadLanguage = (
  grammarName: string,
): Effect.Effect<TreeSitterLanguageInstance, ToolFailure> =>
  Effect.gen(function* () {
    const cached = languageCache.get(grammarName);
    if (cached) return cached;

    const { Language } = yield* initTreeSitter();
    const wasmPath = require.resolve(`tree-sitter-wasms/out/${grammarName}.wasm`);
    const lang = yield* Effect.tryPromise({
      try: () => Language.load(wasmPath),
      catch: (e) => new ToolFailure({ message: `Failed to load grammar ${grammarName}: ${e}` }),
    });
    languageCache.set(grammarName, lang);
    return lang;
  });

/** Init tree-sitter → load grammar → create parser → parse content. */
export const parse = (
  content: string,
  grammarName: string,
): Effect.Effect<TreeSitterTree, ToolFailure> =>
  Effect.gen(function* () {
    const { Parser: ParserClass } = yield* initTreeSitter();
    const lang = yield* loadLanguage(grammarName);
    const parser = new ParserClass();
    parser.setLanguage(lang);
    return parser.parse(content);
  });
