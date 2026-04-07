/**
 * Symbol data type, constructor helper, and formatter.
 */

import type { TreeSitterNode } from "./tree-sitter.ts";

export interface Symbol {
  readonly line: number;
  readonly col: number;
  readonly kind: string;
  readonly name: string;
  readonly signature: string;
}

/** Shorthand: build a Symbol from a tree-sitter node. */
export const sym = (node: TreeSitterNode, kind: string, name: string, signature: string): Symbol => ({
  line: node.startPosition.row + 1,
  col: node.startPosition.column,
  kind,
  name,
  signature,
});

/** Format symbols into aligned columnar output. */
export const formatSymbols = (symbols: Symbol[]): string => {
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
};
