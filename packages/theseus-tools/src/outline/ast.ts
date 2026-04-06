/**
 * Pure AST helpers for tree-sitter nodes.
 */

import type { TreeSitterNode } from "./tree-sitter.ts";

/** Get all children of a node as an array. */
export const children = (node: TreeSitterNode): TreeSitterNode[] => {
  const result: TreeSitterNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) result.push(child);
  }
  return result;
};

/** Find first child matching a given node type. */
export const findChildByType = (node: TreeSitterNode, type: string): TreeSitterNode | null => {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === type) return child;
  }
  return null;
};

/** Check if a node has a specific keyword child (e.g. "async", "static", "get"). */
export const hasKeyword = (node: TreeSitterNode, keyword: string): boolean => {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.childCount === 0 && child.text === keyword) return true;
  }
  return false;
};

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
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  }
  return "";
};

/** Extract superclass / implements from a class declaration. */
export const extractClassExtends = (node: TreeSitterNode): string => {
  const parts: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "extends_clause" || child.type === "implements_clause" || child.type === "class_heritage") {
      parts.push(child.text);
    }
  }
  return parts.join(" ");
};
