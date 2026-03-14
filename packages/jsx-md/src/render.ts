/**
 * render() — converts a VNode tree to a markdown string.
 *
 * This is the top-down evaluation pass. Components in the tree are called
 * here, not at JSX construction time. Children are passed as raw VNode values
 * to each component so they can wrap rendering in context (e.g. DepthContext).
 *
 * Registers itself with the render registry (via _render-registry.ts) on module
 * init to provide Fragment with a render reference without a circular import.
 */

import { registerRender } from './_render-registry.ts';
import { escapeHtmlAttr } from './escape.ts';
import { type VNode, type VNodeElement } from './jsx-runtime.ts';

function isVNodeElement(node: VNode): node is VNodeElement {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

export function render(node: VNode): string {
  if (node === null || node === undefined || node === false || node === true) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return (node as ReadonlyArray<VNode>).map(render).join('');
  }
  // VNodeElement — dispatch on type
  if (!isVNodeElement(node)) {
    return '';
  }
  const el = node; // narrowed to VNodeElement

  // String type → render as an XML block tag
  if (typeof el.type === 'string') {
    const { children, ...attrs } = el.props;
    const attrStr = Object.entries(attrs)
      .filter(([, v]) => v !== undefined && v !== null && v !== false)
      .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeHtmlAttr(String(v))}"`))
      .join('');
    const inner = render(children as VNode ?? null);
    if (inner === '') {
      return `<${el.type}${attrStr} />\n`;
    }
    return `<${el.type}${attrStr}>\n${inner.trimEnd()}\n</${el.type}>\n`;
  }

  // Function component — call with its props (children still as VNode),
  // then recurse in case the component returned a VNode (e.g. a Fragment).
  return render(el.type(el.props));
}

// Register render with Fragment immediately on module init.
// Any entry point that imports render will trigger this before rendering starts.
// Cast is safe: callRender passes only VNode values to render at runtime.
registerRender(render as (node: unknown) => string);
