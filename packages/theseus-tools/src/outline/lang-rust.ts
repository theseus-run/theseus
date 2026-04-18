/**
 * Rust symbol extractor — Match-based node dispatch.
 */

import { Match } from "effect";
import { children, truncate } from "./ast.ts";
import type { Symbol } from "./symbol.ts";
import { sym } from "./symbol.ts";
import type { TreeSitterNode } from "./tree-sitter.ts";

/** Extract symbols from a Rust AST root. */
export const extractSymbolsRust = (root: TreeSitterNode): Symbol[] =>
  children(root).flatMap((node) =>
    Match.value(node.type).pipe(
      Match.when("function_item", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "function", name, node.childForFieldName("parameters")?.text ?? "")];
      }),
      Match.when("struct_item", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "struct", name, "")];
      }),
      Match.when("enum_item", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "enum", name, "")];
      }),
      Match.when("trait_item", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "trait", name, "")];
      }),
      Match.when("impl_item", () => {
        const typeName = node.childForFieldName("type")?.text ?? "";
        return [sym(node, "impl", typeName, "")];
      }),
      Match.when("use_declaration", () => {
        const text = node.text;
        return [sym(node, "import", truncate(text), "")];
      }),
      Match.orElse(() => []),
    ),
  );
