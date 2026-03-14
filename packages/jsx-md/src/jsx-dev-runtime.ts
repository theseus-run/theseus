// Dev mode — re-export everything from jsx-runtime, aliasing jsx as jsxDEV.
// Bun resolves ./jsx-dev-runtime in development builds and calls jsxDEV.
export { jsx as jsxDEV, jsxs, Fragment } from './jsx-runtime.ts';
export type { VNode, VNodeElement } from './jsx-runtime.ts';
