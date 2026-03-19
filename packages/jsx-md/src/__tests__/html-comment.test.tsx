/* @jsxImportSource @theseus.run/jsx-md */

import { describe, expect, test } from "bun:test";
import { HtmlComment, P, render } from "../index.ts";

describe("HtmlComment", () => {
  test("no children renders <!-- -->", () => {
    expect(render(<HtmlComment />)).toBe("<!-- -->\n");
  });

  test("single-line content renders inline", () => {
    expect(render(<HtmlComment>this is a comment</HtmlComment>)).toBe(
      "<!-- this is a comment -->\n",
    );
  });

  test("multi-line string content renders block form", () => {
    expect(render(<HtmlComment>{"line one\nline two"}</HtmlComment>)).toBe(
      "<!--\nline one\nline two\n-->\n",
    );
  });

  test("block children that render to multiple lines", () => {
    expect(
      render(
        <HtmlComment>
          <P>first paragraph</P>
          <P>second paragraph</P>
        </HtmlComment>,
      ),
    ).toBe("<!--\nfirst paragraph\n\nsecond paragraph\n-->\n");
  });

  test("double-dash in content is sanitized — -- → - - (invalid HTML spec fix)", () => {
    // Double-dash inside HTML comments is technically invalid HTML.
    // We sanitize it to '- -' to produce valid HTML comment content.
    expect(render(<HtmlComment>{"some -- comment"}</HtmlComment>)).toBe(
      "<!-- some - - comment -->\n",
    );
  });

  test("closing sequence --> in content is sanitized to -- >", () => {
    expect(render(<HtmlComment>{"injection --> attempt"}</HtmlComment>)).toBe(
      "<!-- injection -- > attempt -->\n",
    );
  });

  test("whitespace-only string renders as <!-- --> — same as no children", () => {
    // trimEnd on '   ' = '' → inner.trim() is falsy → empty comment form
    expect(render(<HtmlComment>{"   "}</HtmlComment>)).toBe("<!-- -->\n");
  });
});
