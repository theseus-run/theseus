/**
 * Synchronous context API for jsx-md — matches the React context shape.
 *
 * createContext(defaultValue) returns a Context object with a Provider
 * component. Wrap a render() call with <Ctx.Provider value={...}> and read
 * the value anywhere in the tree with useContext(Ctx).
 *
 * Uses a module-level stack map so values are available synchronously during
 * the render() traversal. Not safe for async or concurrent rendering.
 */

import { callRender } from './_render-registry.ts';
import type { VNode } from './jsx-runtime.ts';

export interface Context<T> {
  readonly _id: symbol;
  readonly _default: T;
  /** JSX provider component — identical usage to React's Context.Provider. */
  readonly Provider: (props: { value: T; children?: VNode }) => string;
}

/**
 * Process-wide singleton. Not safe for concurrent render() calls in the same
 * process (e.g. simultaneous Bun HTTP requests). For agent prompt generation
 * this is almost always a non-issue — renders are sequential.
 */
const stack = new Map<symbol, unknown[]>();

export function createContext<T>(defaultValue: T): Context<T> {
  const _id = Symbol();

  function Provider({ value, children }: { value: T; children?: VNode }): string {
    let s = stack.get(_id);
    if (!s) {
      s = [];
      stack.set(_id, s);
    }
    s.push(value as unknown);
    try {
      return callRender(children ?? null);
    } finally {
      s.pop();
    }
  }

  return { _id, _default: defaultValue, Provider };
}

export function useContext<T>(ctx: Context<T>): T {
  const s = stack.get(ctx._id);
  if (!s || s.length === 0) {
    return ctx._default;
  }
  return s[s.length - 1] as T;
}

export function withContext<T>(ctx: Context<T>, value: T, fn: () => string): string {
  let s = stack.get(ctx._id);
  if (!s) {
    s = [];
    stack.set(ctx._id, s);
  }
  s.push(value);
  try {
    return fn();
  } finally {
    s.pop();
  }
}
