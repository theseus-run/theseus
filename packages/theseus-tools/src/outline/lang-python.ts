/**
 * Python symbol extractor — Match-based node dispatch.
 */

import { Match } from "effect";
import type { TreeSitterNode } from "./tree-sitter.ts";
import type { Symbol } from "./symbol.ts";
import { sym } from "./symbol.ts";
import { children, truncate } from "./ast.ts";

/** Extract symbols from a Python AST root. */
export const extractSymbolsPython = (root: TreeSitterNode): Symbol[] =>
  children(root).flatMap((node) =>
    Match.value(node.type).pipe(
      Match.when("function_definition", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "function", name, node.childForFieldName("parameters")?.text ?? "")];
      }),
      Match.when("class_definition", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        const symbols: Symbol[] = [sym(node, "class", name, "")];
        const body = node.childForFieldName("body");
        if (body) {
          for (const member of children(body)) {
            if (member.type === "function_definition") {
              const mName = member.childForFieldName("name")?.text ?? "";
              symbols.push(sym(member, "method", `${name}.${mName}`, member.childForFieldName("parameters")?.text ?? ""));
            }
          }
        }
        return symbols;
      }),
      Match.when("import_statement", () => {
        const text = node.text;
        return [sym(node, "import", truncate(text), "")];
      }),
      Match.when("import_from_statement", () => {
        const text = node.text;
        return [sym(node, "import", truncate(text), "")];
      }),
      Match.orElse(() => []),
    ),
  );
