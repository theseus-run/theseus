/**
 * render() — converts a VNode tree to a markdown string.
 *
 * This is the top-down evaluation pass. Components in the tree are called
 * here, not at JSX construction time. Children are passed as raw VNode values
 * to each component so they can wrap rendering in context (e.g. DepthContext).
 *
 * Fragment is a Symbol (imported from jsx-runtime.ts). When render() encounters
 * a VNodeElement whose type is the Fragment symbol, it renders children directly.
 * This keeps the dependency one-way (render.ts → jsx-runtime.ts) with no cycle.
 */

import { escapeHtmlAttr } from "./escape.ts";
import { Fragment, type VNode, type VNodeElement } from "./jsx-runtime.ts";

function isVNodeElement(node: VNode): node is VNodeElement {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

export function render(node: VNode): string {
  if (node === null || node === undefined || node === false || node === true) {
    return "";
  }
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "number") {
    return Number.isFinite(node) ? String(node) : "";
  }
  if (Array.isArray(node)) {
    return node.map(render).join("");
  }
  // VNodeElement — dispatch on type
  if (!isVNodeElement(node)) {
    // From TypeScript's perspective this branch is unreachable: after the null/boolean/string/
    // number/Array guards above, the only remaining VNode member is VNodeElement, so `node`
    // is already narrowed to VNodeElement and `!isVNodeElement` is statically false.
    // The branch is kept as a runtime-only defensive net: if a caller bypasses TypeScript
    // (plain JS, `as any`, etc.) and passes a function as a child, we throw a diagnostic
    // error instead of silently returning ''. The double-cast (`as unknown as fn`) is
    // required precisely because TS knows this is unreachable.
    if (typeof node === "function") {
      throw new Error(
        "jsx-md: a function was passed as a VNode child. Did you forget to call it, or wrap it in JSX? " +
          `Received: ${(node as unknown as (...args: unknown[]) => unknown).name || "anonymous function"}`,
      );
    }
    return "";
  }
  const el = node; // narrowed to VNodeElement

  // Fragment symbol — render children directly
  if (el.type === Fragment) {
    // props is Record<string, unknown> by design (props type varies per-component and cannot
    // be narrowed at the VNodeElement level). The `as VNode` cast is safe in practice: the
    // only source of props.children values is the JSX compiler and user JSX expressions,
    // both of which TypeScript has already validated as VNode at the call site.
    return render((el.props["children"] as VNode) ?? null);
  }

  // String type → render as an XML block tag
  if (typeof el.type === "string") {
    const tagName = el.type;
    if (!/^[a-zA-Z][a-zA-Z0-9:._-]*$/.test(tagName)) {
      throw new Error(
        `jsx-md: invalid XML tag name "${tagName}". Tag names must start with a letter and contain only letters, digits, ':', '.', '_', or '-'.`,
      );
    }
    const { children, ...attrs } = el.props;
    let attrStr = "";
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (v === true) {
        attrStr += ` ${k}`;
      } else if (typeof v === "object") {
        throw new Error(
          `jsx-md: attribute "${k}" received an object value. XML attributes must be strings. ` +
            `Use JSON.stringify() to convert: ${k}={JSON.stringify(v)}`,
        );
      } else {
        attrStr += ` ${k}="${escapeHtmlAttr(String(v))}"`;
      }
    }
    // Same cast rationale as the Fragment branch above: props.children is unknown
    // at the VNodeElement level but is guaranteed VNode by the JSX type system.
    const inner = render((children as VNode) ?? null);
    if (inner.trimEnd() === "") {
      return `<${tagName}${attrStr} />\n`;
    }
    return `<${tagName}${attrStr}>\n${inner.trimEnd()}\n</${tagName}>\n`;
  }

  // Function component — call with its props (children still as VNode),
  // then recurse in case the component returned a VNode.
  return render(el.type(el.props));
}
