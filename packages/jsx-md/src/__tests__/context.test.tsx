/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render, createContext, withContext, useContext } from '../index.ts';
import type { VNode } from '../index.ts';

// ---------------------------------------------------------------------------
// Basic round-trip
// ---------------------------------------------------------------------------

describe('createContext / useContext / withContext', () => {
  test('useContext returns the default value outside any withContext', () => {
    const ctx = createContext('default');
    expect(useContext(ctx)).toBe('default');
  });

  test('withContext provides a value during fn execution', () => {
    const ctx = createContext('light');
    const result = withContext(ctx, 'dark', () => useContext(ctx));
    expect(result).toBe('dark');
  });

  test('withContext restores the default after fn returns', () => {
    const ctx = createContext('default');
    withContext(ctx, 'overridden', () => 'discarded');
    expect(useContext(ctx)).toBe('default');
  });

  test('nested withContext — innermost value wins', () => {
    const ctx = createContext(0);
    const result = withContext(ctx, 1, () =>
      withContext(ctx, 2, () => String(useContext(ctx)))
    );
    expect(result).toBe('2');
  });

  test('outer value is restored after inner withContext exits', () => {
    const ctx = createContext(0);
    withContext(ctx, 1, () => {
      withContext(ctx, 2, () => 'inner');
      expect(useContext(ctx)).toBe(1);
      return 'outer';
    });
  });
});

// ---------------------------------------------------------------------------
// Context in render
// ---------------------------------------------------------------------------

describe('context in render', () => {
  test('component reads context value set by withContext wrapper', () => {
    const ThemeCtx = createContext('light');

    function ThemedBox({ children }: { children?: VNode }): string {
      const theme = useContext(ThemeCtx);
      return `[${theme}] ${render(children ?? null)}`;
    }

    const result = withContext(ThemeCtx, 'dark', () =>
      render(<ThemedBox>content</ThemedBox>)
    );
    expect(result).toBe('[dark] content');
  });

  test('nested render calls each see their own context depth', () => {
    const LevelCtx = createContext(0);

    function ShowLevel(): string {
      return String(useContext(LevelCtx));
    }

    const result = withContext(LevelCtx, 1, () =>
      withContext(LevelCtx, 2, () => render(<ShowLevel />))
    );
    expect(result).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// Error recovery
// ---------------------------------------------------------------------------

describe('context error recovery', () => {
  test('context stack is clean after withContext fn throws', () => {
    const ctx = createContext(0);

    expect(() => {
      withContext(ctx, 42, () => {
        throw new Error('render error');
      });
    }).toThrow('render error');

    // Stack must be clean — default is restored after throw
    expect(useContext(ctx)).toBe(0);
  });

  test('multiple contexts are all restored after throw', () => {
    const ctxA = createContext('a');
    const ctxB = createContext('b');

    expect(() => {
      withContext(ctxA, 'A', () => {
        withContext(ctxB, 'B', () => {
          throw new Error('boom');
        });
        return '';
      });
    }).toThrow('boom');

    expect(useContext(ctxA)).toBe('a');
    expect(useContext(ctxB)).toBe('b');
  });
});
