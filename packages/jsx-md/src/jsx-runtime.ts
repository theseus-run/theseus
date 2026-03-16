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
 * Fragment is a Symbol. render.ts imports this Symbol and handles it explicitly,
 * keeping the dependency one-way: render.ts → jsx-runtime.ts (no cycle).
 */

// ---------------------------------------------------------------------------
// VNode types
// ---------------------------------------------------------------------------

/**
 * The concrete runtime shape of a JSX element — what the `jsx()` factory always produces.
 *
 * Useful for structural inspection of a VNode tree (e.g. testing whether a node is an
 * element rather than a string, null, or array). The `isVNodeElement` predicate in
 * render.ts narrows to this type.
 *
 * @remarks **Do not use as a component return-type annotation.** TypeScript infers
 * `JSX.Element` (= `VNode`) as the return type of JSX expressions, not `VNodeElement`.
 * Annotating a component as `(): VNodeElement` causes TS2322 because `VNode` (the
 * inferred type) is not assignable to the narrower `VNodeElement`. Use `VNode` instead:
 * ```ts
 * // Wrong — TS2322
 * function MyComp(): VNodeElement { return <P>hi</P>; }
 * // Correct
 * function MyComp(): VNode { return <P>hi</P>; }
 * ```
 */
export type VNodeElement = {
  readonly type: Component | string | typeof Fragment;
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
// Fragment symbol
// ---------------------------------------------------------------------------

/**
 * Fragment — a unique Symbol used as the `type` of JSX fragment VNodes.
 * render.ts detects this Symbol and renders children directly, with no wrapper.
 * Using a Symbol (rather than a function) eliminates the circular dependency
 * that previously required _render-registry.ts.
 */
export const Fragment = Symbol('Fragment');

// ---------------------------------------------------------------------------
// JSX factory
// ---------------------------------------------------------------------------

/**
 * JSX factory — called by Bun's compiled JSX. Builds VNode tree; no evaluation.
 *
 * `type` is a function component, a string tag name, or the Fragment symbol.
 * String tags are rendered as XML blocks by render.ts: `<tag attrs>\ncontent\n</tag>\n`
 * (or self-closing when the inner content is empty).
 */
export function jsx(
  type: Component | string | typeof Fragment,
  props: Record<string, unknown>,
): VNodeElement {
  return { type, props };
}

/** jsxs — same as jsx, used when there are multiple children (children is array) */
export const jsxs = jsx;
