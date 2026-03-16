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

import { escapeHtmlAttr } from './escape.ts';
import { Fragment, type VNode, type VNodeElement } from './jsx-runtime.ts';

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
    return Number.isFinite(node) ? String(node) : '';
  }
  if (Array.isArray(node)) {
    return (node as ReadonlyArray<VNode>).map(render).join('');
  }
  // VNodeElement — dispatch on type
  if (!isVNodeElement(node)) {
    // Guard: functions passed as VNodes are a programmer error (TypeScript already
    // catches this at compile time; this throw provides a runtime diagnostic).
    if (typeof node === 'function') {
      throw new Error(
        `jsx-md: a function was passed as a VNode child. Did you forget to call it, or wrap it in JSX? ` +
          `Received: ${(node as unknown as (...args: unknown[]) => unknown).name || 'anonymous function'}`,
      );
    }
    return '';
  }
  const el = node; // narrowed to VNodeElement

  // Fragment symbol — render children directly
  if (el.type === Fragment) {
    return render(el.props.children as VNode ?? null);
  }

  // String type → render as an XML block tag
  if (typeof el.type === 'string') {
    const tagName = el.type;
    if (!/^[a-zA-Z][a-zA-Z0-9:._-]*$/.test(tagName)) {
      throw new Error(
        `jsx-md: invalid XML tag name "${tagName}". Tag names must start with a letter and contain only letters, digits, ':', '.', '_', or '-'.`,
      );
    }
    const { children, ...attrs } = el.props;
    let attrStr = '';
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (v === true) {
        attrStr += ` ${k}`;
      } else if (typeof v === 'object') {
        throw new Error(
          `jsx-md: attribute "${k}" received an object value. XML attributes must be strings. ` +
            `Use JSON.stringify() to convert: ${k}={JSON.stringify(v)}`,
        );
      } else {
        attrStr += ` ${k}="${escapeHtmlAttr(String(v))}"`;
      }
    }
    const inner = render(children as VNode ?? null);
    if (inner.trimEnd() === '') {
      return `<${tagName}${attrStr} />\n`;
    }
    return `<${tagName}${attrStr}>\n${inner.trimEnd()}\n</${tagName}>\n`;
  }

  // Function component — call with its props (children still as VNode),
  // then recurse in case the component returned a VNode.
  return render((el.type as (props: Record<string, unknown>) => VNode)(el.props));
}
