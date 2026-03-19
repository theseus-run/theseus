/* @jsxImportSource @theseus.run/jsx-md */

import { describe, expect, test } from "bun:test";
import type { VNode } from "../index.ts";
import { H2, Hr, P, render } from "../index.ts";

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

describe("Fragment", () => {
  test("multiple block children are concatenated", () => {
    expect(
      render(
        <>
          <P>first paragraph</P>
          <P>second paragraph</P>
        </>,
      ),
    ).toBe("first paragraph\n\nsecond paragraph\n\n");
  });

  test("mixed children — headings, prose, separator", () => {
    expect(
      render(
        <>
          <H2>title</H2>
          <P>body</P>
          <Hr />
        </>,
      ),
    ).toBe("## title\n\nbody\n\n---\n\n");
  });

  test("Fragment renders children without a wrapper", () => {
    // Fragment is now a Symbol; render.ts handles it directly — no circular dep.
    expect(() => render(<P>test</P>)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Null / falsy VNode values
// ---------------------------------------------------------------------------

describe("null and falsy VNode values", () => {
  test("render(null) returns empty string", () => {
    expect(render(null)).toBe("");
  });

  test("render(undefined) returns empty string", () => {
    expect(render(undefined)).toBe("");
  });

  test("render(false) returns empty string", () => {
    expect(render(false)).toBe("");
  });

  test("render(true) returns empty string", () => {
    expect(render(true)).toBe("");
  });

  test('render(0) returns "0"', () => {
    expect(render(0)).toBe("0");
  });

  test('render(42) returns "42"', () => {
    expect(render(42)).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// Number edge cases
// ---------------------------------------------------------------------------

describe("number edge cases", () => {
  test('render(-1) returns "-1"', () => {
    expect(render(-1)).toBe("-1");
  });

  test('render(NaN) returns "" — not a finite number', () => {
    expect(render(Number.NaN)).toBe("");
  });

  test('render(Infinity) returns "" — not a finite number', () => {
    expect(render(Number.POSITIVE_INFINITY)).toBe("");
  });

  test('render(-Infinity) returns "" — not a finite number', () => {
    expect(render(Number.NEGATIVE_INFINITY)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Array edge cases
// ---------------------------------------------------------------------------

describe("array edge cases", () => {
  test("empty array renders empty string", () => {
    expect(render([] as VNode[])).toBe("");
  });

  test("array of strings is concatenated", () => {
    expect(render(["hello", " ", "world"] as VNode[])).toBe("hello world");
  });

  test("array with null, false, undefined mixed with strings — falsy values skipped", () => {
    expect(render(["hello", null, false, undefined, " world"] as VNode[])).toBe("hello world");
  });

  test("array of all-falsy values renders empty string", () => {
    expect(render([null, false, undefined] as VNode[])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Function as VNode — programmer error
// ---------------------------------------------------------------------------

describe("function as VNode", () => {
  test("passing a named function as a VNode throws with helpful message", () => {
    function myBadComponent() {
      return "oops";
    }
    expect(() => render(myBadComponent as unknown as VNode)).toThrow(
      "jsx-md: a function was passed as a VNode child",
    );
  });

  test("error message includes function name", () => {
    function namedFn() {
      return "";
    }
    expect(() => render(namedFn as unknown as VNode)).toThrow("namedFn");
  });
});
