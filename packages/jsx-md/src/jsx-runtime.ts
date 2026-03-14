/**
 * Custom JSX-to-VNode runtime for agent markdown generation.
 *
 * Bun's JSX compilation with `jsxImportSource: "@theseus.run/jsx-md"` resolves
 * `jsx` and `jsxs` from `@theseus.run/jsx-md/jsx-runtime`. The factory builds
 * a VNode tree — no evaluation at construction time.
 *
 * Call `render(node)` from `./render.ts` to produce the final markdown string.
 * All markdown primitives live in primitives.tsx as named components.
 *
 * Fragment circular-dep resolution: Fragment needs render() to flatten children,
 * but render.ts imports types from this file. We use _render-registry.ts as a
 * shared side-channel: render.ts calls registerRender(render) on module init,
 * Fragment defers to callRender(). Any entry point that imports render will
 * register it before rendering starts.
 */

import { callRender } from './_render-registry.ts';

// ---------------------------------------------------------------------------
// VNode types
// ---------------------------------------------------------------------------

export type VNodeElement = {
  readonly type: Component | string;
  readonly props: Record<string, unknown>;
};

export type VNode =
  | null
  | undefined
  | boolean
  | string
  | number
  | VNodeElement
  | ReadonlyArray<VNode>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Component<P = any> = (props: P) => VNode;

// ---------------------------------------------------------------------------
// JSX namespace
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  /**
   * JSX.Element is VNode so that components returning any valid VNode
   * (string, VNodeElement, Fragment, null, etc.) satisfy TypeScript's
   * component return-type check. The jsx() factory always produces
   * VNodeElement at runtime; the wider union is only for type-checking.
   */
  export type Element = VNode;

  // Catch-all — allows arbitrary lowercase XML tags as intrinsic elements.
  export interface IntrinsicElements {
    [tag: string]: { children?: VNode; [attr: string]: unknown };
  }

  export interface ElementChildrenAttribute {
    children: VNode;
  }
}

// ---------------------------------------------------------------------------
// Render registration (avoids circular dep with render.ts)
// ---------------------------------------------------------------------------

// Registration and dispatch are handled by _render-registry.ts.
// render.ts calls registerRender(render) on module init.
// Fragment calls callRender() to evaluate children.

// ---------------------------------------------------------------------------
// JSX factory
// ---------------------------------------------------------------------------

/**
 * JSX factory — called by Bun's compiled JSX. Builds VNode tree; no evaluation.
 *
 * `type` is a function component or a string tag name. String tags are rendered
 * as XML blocks by render.ts: `<tag attrs>\ncontent\n</tag>\n` (or self-closing
 * when the inner content is empty).
 */
export function jsx(type: Component | string, props: Record<string, unknown>): VNodeElement {
  return { type, props };
}

/** jsxs — same as jsx, used when there are multiple children (children is array) */
export const jsxs = jsx;

/** Fragment — renders children. Defers to _render-registry to avoid circular imports. */
export function Fragment({ children }: { children?: VNode }): string {
  return callRender(children ?? null);
}
