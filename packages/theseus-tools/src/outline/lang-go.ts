/**
 * Go symbol extractor — Match-based node dispatch.
 */

import { Match } from "effect";
import type { TreeSitterNode } from "./tree-sitter.ts";
import type { Symbol } from "./symbol.ts";
import { sym } from "./symbol.ts";
import { children, truncate } from "./ast.ts";

/** Extract symbols from a Go AST root. */
export const extractSymbolsGo = (root: TreeSitterNode): Symbol[] =>
  children(root).flatMap((node) =>
    Match.value(node.type).pipe(
      Match.when("function_declaration", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "function", name, node.childForFieldName("parameters")?.text ?? "")];
      }),
      Match.when("method_declaration", () => {
        const receiver = node.childForFieldName("receiver")?.text ?? "";
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "method", `${receiver} ${name}`, node.childForFieldName("parameters")?.text ?? "")];
      }),
      Match.when("type_declaration", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "type", name, "")];
      }),
      Match.when("import_declaration", () => {
        const text = node.text;
        return [sym(node, "import", truncate(text), "")];
      }),
      Match.orElse(() => []),
    ),
  );
