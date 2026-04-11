/**
 * Tree-sitter types, effectified loader, and parse pipeline.
 *
 * Module-level caches are process-lifetime singletons.
 */

import { Effect } from "effect";
import type * as Tool from "@theseus.run/core/Tool";

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

let parserPromise: Promise<{ Parser: TreeSitterParser; Language: TreeSitterLanguageStatic }> | null = null;
const languageCache = new Map<string, TreeSitterLanguageInstance>();

// ---------------------------------------------------------------------------
// Effectified loader
// ---------------------------------------------------------------------------

/** Lazily init tree-sitter WASM runtime (cached after first call). */
export const initTreeSitter = (
  fail: (msg: string) => Tool.ToolError,
): Effect.Effect<{ Parser: TreeSitterParser; Language: TreeSitterLanguageStatic }, Tool.ToolError> =>
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
    catch: (e) => fail(`Failed to initialize tree-sitter: ${e}`),
  });

/** Load (and cache) a tree-sitter grammar by name. */
export const loadLanguage = (
  grammarName: string,
  fail: (msg: string) => Tool.ToolError,
): Effect.Effect<TreeSitterLanguageInstance, Tool.ToolError> =>
  Effect.gen(function* () {
    const cached = languageCache.get(grammarName);
    if (cached) return cached;

    const { Language } = yield* initTreeSitter(fail);
    const wasmPath = require.resolve(`tree-sitter-wasms/out/${grammarName}.wasm`);
    const lang = yield* Effect.tryPromise({
      try: () => Language.load(wasmPath),
      catch: (e) => fail(`Failed to load grammar ${grammarName}: ${e}`),
    });
    languageCache.set(grammarName, lang);
    return lang;
  });

/** Init tree-sitter → load grammar → create parser → parse content. */
export const parse = (
  content: string,
  grammarName: string,
  fail: (msg: string) => Tool.ToolError,
): Effect.Effect<TreeSitterTree, Tool.ToolError> =>
  Effect.gen(function* () {
    const { Parser: ParserClass } = yield* initTreeSitter(fail);
    const lang = yield* loadLanguage(grammarName, fail);
    const parser = new ParserClass();
    parser.setLanguage(lang);
    return parser.parse(content);
  });
