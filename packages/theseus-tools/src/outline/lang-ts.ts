/**
 * TypeScript / TSX / JavaScript symbol extractor.
 *
 * Uses Match.value for node dispatch instead of switch statements.
 */

import { Match } from "effect";
import type { TreeSitterNode } from "./tree-sitter.ts";
import type { Symbol } from "./symbol.ts";
import { sym } from "./symbol.ts";
import { children, hasKeyword, extractSignature, extractTypeValue, extractClassExtends, findChildByType } from "./ast.ts";

const functionSym = (node: TreeSitterNode, prefix?: string): Symbol => {
  const name = node.childForFieldName("name")?.text ?? "";
  const async = hasKeyword(node, "async") ? "async " : "";
  const gen = node.type === "generator_function_declaration" ? "*" : "";
  return sym(node, "function", `${prefix ?? ""}${gen}${name}`, `${async}${extractSignature(node)}`);
};

const classSym = (node: TreeSitterNode, prefix?: string): Symbol[] => {
  const name = node.childForFieldName("name")?.text ?? "";
  const ext = extractClassExtends(node);
  const symbols: Symbol[] = [sym(node, "class", `${prefix ?? ""}${name}`, ext)];

  const body = node.childForFieldName("body");
  if (body) {
    for (const member of children(body)) {
      if (member.type === "{" || member.type === "}" || member.type === ";") continue;
      symbols.push(...processClassMember(member, name));
    }
  }
  return symbols;
};

const interfaceSym = (node: TreeSitterNode, prefix?: string): Symbol[] => {
  const name = node.childForFieldName("name")?.text ?? "";
  const ext = extractClassExtends(node);
  const symbols: Symbol[] = [sym(node, "interface", `${prefix ?? ""}${name}`, ext)];

  const body = node.childForFieldName("body");
  if (body) {
    for (const member of children(body)) {
      if (member.type === "{" || member.type === "}" || member.type === ";") continue;
      if (member.type === "method_signature" || member.type === "property_signature") {
        const mName = member.childForFieldName("name")?.text ?? "";
        const mSig = extractSignature(member);
        symbols.push(
          sym(member, member.type === "method_signature" ? "method" : "property", `${name}.${mName}`, mSig),
        );
      }
    }
  }
  return symbols;
};

const variableSym = (node: TreeSitterNode, prefix?: string): Symbol[] => {
  const symbols: Symbol[] = [];
  for (const child of children(node)) {
    if (child.type !== "variable_declarator") continue;
    const vName = child.childForFieldName("name")?.text ?? "";
    const vValue = child.childForFieldName("value");
    if (vValue && (vValue.type === "arrow_function" || vValue.type === "function_expression")) {
      const async = hasKeyword(vValue, "async") ? "async " : "";
      symbols.push(sym(child, "function", `${prefix ?? ""}${vName}`, `${async}${extractSignature(vValue)}`));
    } else {
      const typeAnn = findChildByType(child, "type_annotation");
      symbols.push(sym(child, "variable", `${prefix ?? ""}${vName}`, typeAnn?.text ?? ""));
    }
  }
  return symbols;
};

const importSym = (node: TreeSitterNode): Symbol => {
  const source = node.childForFieldName("source");
  return sym(node, "import", source?.text ?? node.text.slice(0, 60), "");
};

const exportSym = (node: TreeSitterNode): Symbol[] => {
  const isDefault = hasKeyword(node, "default");
  const prefix = isDefault ? "default " : undefined;
  const symbols: Symbol[] = [];
  let hasDecl = false;

  for (const child of children(node)) {
    const extracted = Match.value(child.type).pipe(
      Match.when("function_declaration", () => { hasDecl = true; return [functionSym(child, prefix)]; }),
      Match.when("generator_function_declaration", () => { hasDecl = true; return [functionSym(child, prefix)]; }),
      Match.when("class_declaration", () => { hasDecl = true; return classSym(child, prefix); }),
      Match.when("interface_declaration", () => { hasDecl = true; return interfaceSym(child, prefix); }),
      Match.when("type_alias_declaration", () => {
        hasDecl = true;
        const name = child.childForFieldName("name")?.text ?? "";
        return [sym(child, "type", `${prefix ?? ""}${name}`, `= ${extractTypeValue(child)}`)];
      }),
      Match.when("enum_declaration", () => {
        hasDecl = true;
        const name = child.childForFieldName("name")?.text ?? "";
        return [sym(child, "enum", `${prefix ?? ""}${name}`, "")];
      }),
      Match.when("lexical_declaration", () => { hasDecl = true; return variableSym(child, prefix); }),
      Match.when("variable_declaration", () => { hasDecl = true; return variableSym(child, prefix); }),
      Match.orElse(() => []),
    );
    symbols.push(...extracted);
  }

  if (!hasDecl) {
    const source = node.childForFieldName("source");
    if (source) {
      symbols.push(sym(node, "export", source.text, ""));
    }
  }
  return symbols;
};

const processClassMember = (member: TreeSitterNode, className: string): Symbol[] =>
  Match.value(member.type).pipe(
    Match.when("method_definition", () => {
      const mName = member.childForFieldName("name")?.text ?? "";
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

      return [
        sym(
          member,
          kind,
          `${className}.${mName}`,
          `${qualifiers.length ? `${qualifiers.join(" ")} ` : ""}${extractSignature(member)}`,
        ),
      ];
    }),
    Match.when("public_field_definition", () => {
      const mName = member.childForFieldName("name")?.text ?? "";
      const isStatic = hasKeyword(member, "static");
      const typeAnn = findChildByType(member, "type_annotation");
      return [sym(member, "property", `${className}.${mName}`, `${isStatic ? "static " : ""}${typeAnn?.text ?? ""}`)];
    }),
    Match.orElse(() => []),
  );

/** Extract symbols from a TypeScript/TSX/JavaScript AST root. */
export const extractSymbolsTS = (root: TreeSitterNode): Symbol[] =>
  children(root).flatMap((node) =>
    Match.value(node.type).pipe(
      Match.when("function_declaration", () => [functionSym(node)]),
      Match.when("generator_function_declaration", () => [functionSym(node)]),
      Match.when("class_declaration", () => classSym(node)),
      Match.when("interface_declaration", () => interfaceSym(node)),
      Match.when("type_alias_declaration", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "type", name, `= ${extractTypeValue(node)}`)];
      }),
      Match.when("enum_declaration", () => {
        const name = node.childForFieldName("name")?.text ?? "";
        return [sym(node, "enum", name, "")];
      }),
      Match.when("lexical_declaration", () => variableSym(node)),
      Match.when("variable_declaration", () => variableSym(node)),
      Match.when("import_statement", () => [importSym(node)]),
      Match.when("export_statement", () => exportSym(node)),
      Match.orElse(() => []),
    ),
  );
