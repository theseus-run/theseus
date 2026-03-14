/**
 * Minimal synchronous context API for jsx-md.
 *
 * Uses a module-level stack map so context values are available synchronously
 * during the render() traversal. Not safe for async or concurrent rendering.
 */

export interface Context<T> {
  readonly _id: symbol;
  readonly _default: T;
}

/**
 * Process-wide singleton. Not safe for concurrent render() calls in the same
 * process (e.g. simultaneous Bun HTTP requests). For agent prompt generation
 * this is almost always a non-issue — renders are sequential.
 */
const stack = new Map<symbol, unknown[]>();

export function createContext<T>(defaultValue: T): Context<T> {
  return { _id: Symbol(), _default: defaultValue };
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
