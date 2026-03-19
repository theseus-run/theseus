// Dev mode — re-export everything from jsx-runtime, aliasing jsx as jsxDEV.
// Bun resolves ./jsx-dev-runtime in development builds and calls jsxDEV.

export type { VNode, VNodeElement } from "./jsx-runtime.ts";
export { Fragment, jsx as jsxDEV, jsxs } from "./jsx-runtime.ts";
