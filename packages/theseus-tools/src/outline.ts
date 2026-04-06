/**
 * outline — Extract symbols from source files using tree-sitter.
 *
 * Uses web-tree-sitter (WASM) for fast, accurate parsing.
 * Outputs one line per symbol: `line:col  kind  name  signature`
 * 60-80% token savings vs read_file for structural understanding.
 *
 * Languages: TypeScript, TSX, JavaScript, Python, Go, Rust (extensible).
 */

import { Effect } from "effect";
import { defineTool, fromZod } from "@theseus.run/core";
import { z } from "zod";
import { extname } from "node:path";

// Lazy-loaded tree-sitter (loaded once, cached)
let parserPromise: Promise<{ Parser: TreeSitterParser; Language: TreeSitterLanguageStatic }> | null = null;
const languageCache = new Map<string, TreeSitterLanguageInstance>();

// Types for web-tree-sitter (CJS module)
type TreeSitterParser = {
  new (): TreeSitterParserInstance;
  init(): Promise<void>;
};
type TreeSitterLanguageInstance = { readonly _brand?: "Language" };
type TreeSitterLanguageStatic = {
  load(path: string): Promise<TreeSitterLanguageInstance>;
};
type TreeSitterParserInstance = {
  setLanguage(lang: TreeSitterLanguageInstance): void;
  parse(input: string): TreeSitterTree;
};
type TreeSitterTree = {
  rootNode: TreeSitterNode;
};
type TreeSitterNode = {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  childCount: number;
  child(index: number): TreeSitterNode | null;
  childForFieldName(name: string): TreeSitterNode | null;
};

const EXT_TO_GRAMMAR: Record<string, string> = {
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

const SUPPORTED_EXTS = new Set(Object.keys(EXT_TO_GRAMMAR));

async function getTreeSitter() {
  if (!parserPromise) {
    parserPromise = (async () => {
      // CJS module — require for Bun compat
      const mod = require("web-tree-sitter") as {
        Parser: TreeSitterParser;
        Language: TreeSitterLanguageStatic;
      };
      await mod.Parser.init();
      return mod;
    })();
  }
  return parserPromise;
}

async function getLanguage(grammarName: string): Promise<TreeSitterLanguageInstance> {
  const cached = languageCache.get(grammarName);
  if (cached) return cached;

  const { Language } = await getTreeSitter();
  const wasmPath = require.resolve(`tree-sitter-wasms/out/${grammarName}.wasm`);
  const lang = await Language.load(wasmPath);
  languageCache.set(grammarName, lang);
  return lang;
}

interface Symbol {
  line: number;
  col: number;
  kind: string;
  name: string;
  signature: string;
}

/** Extract a concise signature from a node (params + return type, no body). */
function extractSignature(node: TreeSitterNode): string {
  const params = node.childForFieldName("parameters");
  const returnType = node.childForFieldName("return_type") ?? findChildByType(node, "type_annotation");
  const typeParams = node.childForFieldName("type_parameters") ?? findChildByType(node, "type_parameters");

  let sig = "";
  if (typeParams) sig += typeParams.text;
  if (params) sig += params.text;
  if (returnType) sig += returnType.text;
  return sig;
}

function findChildByType(node: TreeSitterNode, type: string): TreeSitterNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === type) return child;
  }
  return null;
}

/** Check if a node has a specific keyword child (e.g. "async", "static", "get"). */
function hasKeyword(node: TreeSitterNode, keyword: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.childCount === 0 && child.text === keyword) return true;
  }
  return false;
}

/** Extract the "value" part of a type_alias_declaration (the right-hand side). */
function extractTypeValue(node: TreeSitterNode): string {
  const value = node.childForFieldName("value");
  if (value) {
    const text = value.text;
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  }
  return "";
}

/** Extract superclass / implements from a class declaration. */
function extractClassExtends(node: TreeSitterNode): string {
  const parts: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "extends_clause" || child.type === "implements_clause" || child.type === "class_heritage") {
      parts.push(child.text);
    }
  }
  return parts.join(" ");
}

/** Extract symbols from a TypeScript/JavaScript AST. */
function extractSymbolsTS(root: TreeSitterNode): Symbol[] {
  const symbols: Symbol[] = [];

  function processNode(node: TreeSitterNode, prefix?: string) {
    const pos = node.startPosition;
    const nameNode = node.childForFieldName("name");
    const name = nameNode?.text ?? "";

    switch (node.type) {
      case "function_declaration":
      case "generator_function_declaration": {
        const async = hasKeyword(node, "async") ? "async " : "";
        const gen = node.type === "generator_function_declaration" ? "*" : "";
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "function",
          name: `${prefix ?? ""}${gen}${name}`,
          signature: `${async}${extractSignature(node)}`,
        });
        break;
      }

      case "class_declaration": {
        const ext = extractClassExtends(node);
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "class",
          name: `${prefix ?? ""}${name}`,
          signature: ext,
        });
        // Walk class body for members
        const body = node.childForFieldName("body");
        if (body) {
          for (let i = 0; i < body.childCount; i++) {
            const member = body.child(i);
            if (!member || member.type === "{" || member.type === "}" || member.type === ";") continue;
            processClassMember(member, name);
          }
        }
        break;
      }

      case "interface_declaration": {
        const ext = extractClassExtends(node);
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "interface",
          name: `${prefix ?? ""}${name}`,
          signature: ext,
        });
        // Walk interface body for method signatures
        const body = node.childForFieldName("body");
        if (body) {
          for (let i = 0; i < body.childCount; i++) {
            const member = body.child(i);
            if (!member || member.type === "{" || member.type === "}" || member.type === ";") continue;
            if (member.type === "method_signature" || member.type === "property_signature") {
              const mName = member.childForFieldName("name")?.text ?? "";
              const mSig = extractSignature(member);
              symbols.push({
                line: member.startPosition.row + 1,
                col: member.startPosition.column,
                kind: member.type === "method_signature" ? "method" : "property",
                name: `${name}.${mName}`,
                signature: mSig,
              });
            }
          }
        }
        break;
      }

      case "type_alias_declaration":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "type",
          name: `${prefix ?? ""}${name}`,
          signature: `= ${extractTypeValue(node)}`,
        });
        break;

      case "enum_declaration":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "enum",
          name: `${prefix ?? ""}${name}`,
          signature: "",
        });
        break;

      case "lexical_declaration":
      case "variable_declaration": {
        // const/let/var — extract variable declarators
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child?.type !== "variable_declarator") continue;
          const vName = child.childForFieldName("name")?.text ?? "";
          const vValue = child.childForFieldName("value");
          if (vValue && (vValue.type === "arrow_function" || vValue.type === "function_expression")) {
            const async = hasKeyword(vValue, "async") ? "async " : "";
            symbols.push({
              line: child.startPosition.row + 1,
              col: child.startPosition.column,
              kind: "function",
              name: `${prefix ?? ""}${vName}`,
              signature: `${async}${extractSignature(vValue)}`,
            });
          } else {
            const typeAnn = findChildByType(child, "type_annotation");
            symbols.push({
              line: child.startPosition.row + 1,
              col: child.startPosition.column,
              kind: "variable",
              name: `${prefix ?? ""}${vName}`,
              signature: typeAnn?.text ?? "",
            });
          }
        }
        break;
      }

      case "import_statement":
        // Summarize import: just the source
        {
          const source = node.childForFieldName("source");
          symbols.push({
            line: pos.row + 1,
            col: pos.column,
            kind: "import",
            name: source?.text ?? node.text.slice(0, 60),
            signature: "",
          });
        }
        break;

      case "export_statement": {
        // Unwrap: the actual declaration is inside
        let hasDecl = false;
        const isDefault = hasKeyword(node, "default");
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (!child) continue;
          if (
            child.type === "function_declaration" ||
            child.type === "generator_function_declaration" ||
            child.type === "class_declaration" ||
            child.type === "interface_declaration" ||
            child.type === "type_alias_declaration" ||
            child.type === "enum_declaration" ||
            child.type === "lexical_declaration" ||
            child.type === "variable_declaration"
          ) {
            processNode(child, isDefault ? "default " : undefined);
            hasDecl = true;
          }
        }
        // Re-export statement like `export { foo } from "./bar"`
        if (!hasDecl) {
          const source = node.childForFieldName("source");
          if (source) {
            symbols.push({
              line: pos.row + 1,
              col: pos.column,
              kind: "export",
              name: source.text,
              signature: "",
            });
          }
        }
        break;
      }
    }
  }

  function processClassMember(member: TreeSitterNode, className: string) {
    const pos = member.startPosition;
    const mName = member.childForFieldName("name")?.text ?? "";

    switch (member.type) {
      case "method_definition": {
        const isGetter = hasKeyword(member, "get");
        const isSetter = hasKeyword(member, "set");
        const isAsync = hasKeyword(member, "async");
        const isStatic = hasKeyword(member, "static");

        let kind = "method";
        if (isGetter) kind = "getter";
        else if (isSetter) kind = "setter";

        const qualifiers: string[] = [];
        if (isStatic) qualifiers.push("static");
        if (isAsync) qualifiers.push("async");

        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind,
          name: `${className}.${mName}`,
          signature: `${qualifiers.length ? qualifiers.join(" ") + " " : ""}${extractSignature(member)}`,
        });
        break;
      }
      case "public_field_definition": {
        const isStatic = hasKeyword(member, "static");
        const typeAnn = findChildByType(member, "type_annotation");
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "property",
          name: `${className}.${mName}`,
          signature: `${isStatic ? "static " : ""}${typeAnn?.text ?? ""}`,
        });
        break;
      }
    }
  }

  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child) processNode(child);
  }

  return symbols;
}

/** Generic Python symbol extraction. */
function extractSymbolsPython(root: TreeSitterNode): Symbol[] {
  const symbols: Symbol[] = [];

  for (let i = 0; i < root.childCount; i++) {
    const node = root.child(i);
    if (!node) continue;
    const pos = node.startPosition;
    const name = node.childForFieldName("name")?.text ?? "";

    switch (node.type) {
      case "function_definition":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "function",
          name,
          signature: node.childForFieldName("parameters")?.text ?? "",
        });
        break;
      case "class_definition": {
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "class",
          name,
          signature: "",
        });
        // Walk class body for methods
        const body = node.childForFieldName("body");
        if (body) {
          for (let j = 0; j < body.childCount; j++) {
            const member = body.child(j);
            if (member?.type === "function_definition") {
              const mName = member.childForFieldName("name")?.text ?? "";
              symbols.push({
                line: member.startPosition.row + 1,
                col: member.startPosition.column,
                kind: "method",
                name: `${name}.${mName}`,
                signature: member.childForFieldName("parameters")?.text ?? "",
              });
            }
          }
        }
        break;
      }
      case "import_statement":
      case "import_from_statement":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "import",
          name: node.text.length > 60 ? `${node.text.slice(0, 57)}...` : node.text,
          signature: "",
        });
        break;
    }
  }
  return symbols;
}

/** Generic Go symbol extraction. */
function extractSymbolsGo(root: TreeSitterNode): Symbol[] {
  const symbols: Symbol[] = [];

  for (let i = 0; i < root.childCount; i++) {
    const node = root.child(i);
    if (!node) continue;
    const pos = node.startPosition;
    const name = node.childForFieldName("name")?.text ?? "";

    switch (node.type) {
      case "function_declaration":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "function",
          name,
          signature: node.childForFieldName("parameters")?.text ?? "",
        });
        break;
      case "method_declaration": {
        const receiver = node.childForFieldName("receiver")?.text ?? "";
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "method",
          name: `${receiver} ${name}`,
          signature: node.childForFieldName("parameters")?.text ?? "",
        });
        break;
      }
      case "type_declaration":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "type",
          name,
          signature: "",
        });
        break;
      case "import_declaration":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "import",
          name: node.text.length > 60 ? `${node.text.slice(0, 57)}...` : node.text,
          signature: "",
        });
        break;
    }
  }
  return symbols;
}

/** Generic Rust symbol extraction. */
function extractSymbolsRust(root: TreeSitterNode): Symbol[] {
  const symbols: Symbol[] = [];

  for (let i = 0; i < root.childCount; i++) {
    const node = root.child(i);
    if (!node) continue;
    const pos = node.startPosition;
    const name = node.childForFieldName("name")?.text ?? "";

    switch (node.type) {
      case "function_item":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "function",
          name,
          signature: node.childForFieldName("parameters")?.text ?? "",
        });
        break;
      case "struct_item":
        symbols.push({ line: pos.row + 1, col: pos.column, kind: "struct", name, signature: "" });
        break;
      case "enum_item":
        symbols.push({ line: pos.row + 1, col: pos.column, kind: "enum", name, signature: "" });
        break;
      case "trait_item":
        symbols.push({ line: pos.row + 1, col: pos.column, kind: "trait", name, signature: "" });
        break;
      case "impl_item": {
        const typeName = node.childForFieldName("type")?.text ?? "";
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "impl",
          name: typeName,
          signature: "",
        });
        break;
      }
      case "use_declaration":
        symbols.push({
          line: pos.row + 1,
          col: pos.column,
          kind: "import",
          name: node.text.length > 60 ? `${node.text.slice(0, 57)}...` : node.text,
          signature: "",
        });
        break;
    }
  }
  return symbols;
}

function extractSymbols(root: TreeSitterNode, grammar: string): Symbol[] {
  switch (grammar) {
    case "tree-sitter-typescript":
    case "tree-sitter-tsx":
    case "tree-sitter-javascript":
      return extractSymbolsTS(root);
    case "tree-sitter-python":
      return extractSymbolsPython(root);
    case "tree-sitter-go":
      return extractSymbolsGo(root);
    case "tree-sitter-rust":
      return extractSymbolsRust(root);
    default:
      return extractSymbolsTS(root);
  }
}

function formatSymbols(symbols: Symbol[]): string {
  if (symbols.length === 0) return "No symbols found";

  const maxLine = Math.max(...symbols.map((s) => String(s.line).length));
  const maxKind = Math.max(...symbols.map((s) => s.kind.length));

  return symbols
    .map((s) => {
      const loc = `${String(s.line).padStart(maxLine)}:${String(s.col).padEnd(3)}`;
      const kind = s.kind.padEnd(maxKind);
      const sig = s.signature ? `  ${s.signature}` : "";
      return `${loc} ${kind}  ${s.name}${sig}`;
    })
    .join("\n");
}

// --- Tool definition ---

const inputSchema = z.object({
  path: z.string().min(1),
});

type Input = z.infer<typeof inputSchema>;

export const outline = defineTool<Input, string>({
  name: "outline",
  description:
    "Extract symbol outline from a source file (functions, classes, types, imports). Uses tree-sitter for fast, accurate parsing. Much cheaper than read_file for structural understanding.",
  inputSchema: fromZod(inputSchema),
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

      const { Parser: ParserClass } = yield* Effect.tryPromise({
        try: () => getTreeSitter(),
        catch: (e) => fail(`Failed to initialize tree-sitter: ${e}`),
      });

      const lang = yield* Effect.tryPromise({
        try: () => getLanguage(grammarName),
        catch: (e) => fail(`Failed to load grammar ${grammarName}: ${e}`),
      });

      const parser = new ParserClass();
      parser.setLanguage(lang);
      const tree = parser.parse(content);

      const symbols = extractSymbols(tree.rootNode, grammarName);
      return formatSymbols(symbols);
    }),
  encode: (s) => s,
});
