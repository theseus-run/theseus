/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import type { VNode } from '../index.ts';
import { P, H2, Hr } from '../index.ts';

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

describe('Fragment', () => {
  test('multiple block children are concatenated', () => {
    expect(render(
      <>
        <P>first paragraph</P>
        <P>second paragraph</P>
      </>
    )).toBe('first paragraph\n\nsecond paragraph\n\n');
  });

  test('mixed children — headings, prose, separator', () => {
    expect(render(
      <>
        <H2>title</H2>
        <P>body</P>
        <Hr />
      </>
    )).toBe('## title\n\nbody\n\n---\n\n');
  });

  test('Fragment is safe when render is imported before JSX evaluation', () => {
    // Documents the import-order contract: Fragment calls _renderFn which
    // is registered by render.ts on module init.
    expect(() => render(<><P>test</P></>)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Null / falsy VNode values
// ---------------------------------------------------------------------------

describe('null and falsy VNode values', () => {
  test('render(null) returns empty string', () => {
    expect(render(null)).toBe('');
  });

  test('render(undefined) returns empty string', () => {
    expect(render(undefined)).toBe('');
  });

  test('render(false) returns empty string', () => {
    expect(render(false)).toBe('');
  });

  test('render(true) returns empty string', () => {
    expect(render(true)).toBe('');
  });

  test('render(0) returns "0"', () => {
    expect(render(0)).toBe('0');
  });

  test('render(42) returns "42"', () => {
    expect(render(42)).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// Number edge cases
// ---------------------------------------------------------------------------

describe('number edge cases', () => {
  test('render(-1) returns "-1"', () => {
    expect(render(-1)).toBe('-1');
  });

  test('render(NaN) returns "NaN" — String(NaN) behavior', () => {
    expect(render(NaN)).toBe('NaN');
  });

  test('render(Infinity) returns "Infinity" — String(Infinity) behavior', () => {
    expect(render(Infinity)).toBe('Infinity');
  });
});

// ---------------------------------------------------------------------------
// Array edge cases
// ---------------------------------------------------------------------------

describe('array edge cases', () => {
  test('empty array renders empty string', () => {
    expect(render([] as VNode[])).toBe('');
  });

  test('array of strings is concatenated', () => {
    expect(render(['hello', ' ', 'world'] as VNode[])).toBe('hello world');
  });

  test('array with null, false, undefined mixed with strings — falsy values skipped', () => {
    expect(render(['hello', null, false, undefined, ' world'] as VNode[])).toBe('hello world');
  });

  test('array of all-falsy values renders empty string', () => {
    expect(render([null, false, undefined] as VNode[])).toBe('');
  });
});
