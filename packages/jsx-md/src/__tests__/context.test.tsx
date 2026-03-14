/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render, createContext, withContext, useContext } from '../index.ts';
import type { VNode } from '../index.ts';

// ---------------------------------------------------------------------------
// Basic round-trip — withContext (lower-level API)
// ---------------------------------------------------------------------------

describe('createContext / useContext / withContext', () => {
  test('useContext returns the default value outside any provider', () => {
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
// Provider JSX API — matches React's Context.Provider pattern
// ---------------------------------------------------------------------------

describe('Context.Provider', () => {
  test('Provider passes value to useContext inside render', () => {
    const ThemeCtx = createContext('light');

    function ThemedBox(): string {
      const theme = useContext(ThemeCtx);
      return `theme=${theme}`;
    }

    expect(render(
      <ThemeCtx.Provider value="dark">
        <ThemedBox />
      </ThemeCtx.Provider>
    )).toBe('theme=dark');
  });

  test('useContext returns default outside Provider', () => {
    const ThemeCtx = createContext('light');

    function ThemedBox(): string {
      return useContext(ThemeCtx);
    }

    expect(render(<ThemedBox />)).toBe('light');
  });

  test('Provider restores default after render completes', () => {
    const ThemeCtx = createContext('light');

    render(
      <ThemeCtx.Provider value="dark">
        {''}
      </ThemeCtx.Provider>
    );

    expect(useContext(ThemeCtx)).toBe('light');
  });

  test('nested Providers — innermost value wins', () => {
    const ThemeCtx = createContext('light');

    function ShowTheme(): string {
      return useContext(ThemeCtx);
    }

    expect(render(
      <ThemeCtx.Provider value="dark">
        <ThemeCtx.Provider value="high-contrast">
          <ShowTheme />
        </ThemeCtx.Provider>
      </ThemeCtx.Provider>
    )).toBe('high-contrast');
  });

  test('outer Provider value is restored after inner Provider exits', () => {
    const ThemeCtx = createContext('light');

    function ShowTheme(): string {
      return useContext(ThemeCtx);
    }

    // The outer Provider renders two children:
    // 1. inner Provider with 'high-contrast' wrapping ShowTheme
    // 2. ShowTheme directly — should see 'dark', not 'high-contrast'
    expect(render(
      <ThemeCtx.Provider value="dark">
        <>
          <ThemeCtx.Provider value="high-contrast">
            {''}
          </ThemeCtx.Provider>
          <ShowTheme />
        </>
      </ThemeCtx.Provider>
    )).toBe('dark');
  });

  test('multiple independent contexts propagate independently', () => {
    const LangCtx = createContext('en');
    const ThemeCtx = createContext('light');

    function ShowBoth(): string {
      return `${useContext(LangCtx)}-${useContext(ThemeCtx)}`;
    }

    expect(render(
      <LangCtx.Provider value="fr">
        <ThemeCtx.Provider value="dark">
          <ShowBoth />
        </ThemeCtx.Provider>
      </LangCtx.Provider>
    )).toBe('fr-dark');
  });

  test('Provider renders children normally (passthrough when no consumer)', () => {
    const Ctx = createContext('x');

    expect(render(
      <Ctx.Provider value="y">
        {'hello'}
      </Ctx.Provider>
    )).toBe('hello');
  });

  test('Provider with no children renders empty string', () => {
    const Ctx = createContext('x');
    expect(render(<Ctx.Provider value="y" />)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Context in render — component reads Provider value
// ---------------------------------------------------------------------------

describe('context in render', () => {
  test('component reads context value set by Provider', () => {
    const ThemeCtx = createContext('light');

    function ThemedBox({ children }: { children?: VNode }): string {
      const theme = useContext(ThemeCtx);
      return `[${theme}] ${render(children ?? null)}`;
    }

    expect(render(
      <ThemeCtx.Provider value="dark">
        <ThemedBox>content</ThemedBox>
      </ThemeCtx.Provider>
    )).toBe('[dark] content');
  });

  test('nested render calls each see their own context depth', () => {
    const LevelCtx = createContext(0);

    function ShowLevel(): string {
      return String(useContext(LevelCtx));
    }

    expect(render(
      <LevelCtx.Provider value={1}>
        <LevelCtx.Provider value={2}>
          <ShowLevel />
        </LevelCtx.Provider>
      </LevelCtx.Provider>
    )).toBe('2');
  });

  test('withContext and Provider interoperate on the same context', () => {
    const Ctx = createContext('default');

    function ShowValue(): string {
      return useContext(Ctx);
    }

    // withContext wrapping a render that uses Provider — innermost wins
    const result = withContext(Ctx, 'outer', () =>
      render(
        <Ctx.Provider value="inner">
          <ShowValue />
        </Ctx.Provider>
      )
    );
    expect(result).toBe('inner');
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
