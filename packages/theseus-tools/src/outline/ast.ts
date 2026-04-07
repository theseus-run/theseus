/**
 * Pure AST helpers for tree-sitter nodes.
 */

import type { TreeSitterNode } from "./tree-sitter.ts";

/** Truncate text to max length with ellipsis. */
export const truncate = (text: string, max = 60): string =>
  text.length > max ? `${text.slice(0, max - 3)}...` : text;

/** Get all children of a node as an array. */
export const children = (node: TreeSitterNode): TreeSitterNode[] =>
  Array.from({ length: node.childCount }, (_, i) => node.child(i)).filter(
    (c): c is TreeSitterNode => c !== null,
  );

/** Find first child matching a given node type. */
export const findChildByType = (node: TreeSitterNode, type: string): TreeSitterNode | null =>
  children(node).find((c) => c.type === type) ?? null;

/** Check if a node has a specific keyword child (e.g. "async", "static", "get"). */
export const hasKeyword = (node: TreeSitterNode, keyword: string): boolean =>
  children(node).some((c) => c.childCount === 0 && c.text === keyword);

/** Extract a concise signature from a node (params + return type, no body). */
export const extractSignature = (node: TreeSitterNode): string => {
  const params = node.childForFieldName("parameters");
  const returnType = node.childForFieldName("return_type") ?? findChildByType(node, "type_annotation");
  const typeParams = node.childForFieldName("type_parameters") ?? findChildByType(node, "type_parameters");

  let sig = "";
  if (typeParams) sig += typeParams.text;
  if (params) sig += params.text;
  if (returnType) sig += returnType.text;
  return sig;
};

/** Extract the "value" part of a type_alias_declaration (RHS, truncated). */
export const extractTypeValue = (node: TreeSitterNode): string => {
  const value = node.childForFieldName("value");
  if (value) {
    const text = value.text;
    return truncate(text);
  }
  return "";
};

/** Extract superclass / implements from a class declaration. */
export const extractClassExtends = (node: TreeSitterNode): string =>
  children(node)
    .filter((c) => c.type === "extends_clause" || c.type === "implements_clause" || c.type === "class_heritage")
    .map((c) => c.text)
    .join(" ");
