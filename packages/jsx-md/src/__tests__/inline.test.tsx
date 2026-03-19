/* @jsxImportSource @theseus.run/jsx-md */

import { describe, expect, test } from "bun:test";
import {
  Bold,
  Br,
  Code,
  Escape,
  Img,
  Italic,
  Kbd,
  Link,
  Md,
  P,
  render,
  Strikethrough,
  Sub,
  Sup,
} from "../index.ts";

// ---------------------------------------------------------------------------
// Bold
// ---------------------------------------------------------------------------

describe("Bold", () => {
  test("wraps content in **", () => {
    expect(render(<Bold>important</Bold>)).toBe("**important**");
  });

  test("nested in P", () => {
    expect(
      render(
        <P>
          <Bold>hello</Bold> world
        </P>,
      ),
    ).toBe("**hello** world\n\n");
  });

  test("empty children → ****", () => {
    expect(render(<Bold></Bold>)).toBe("****");
  });

  test("wrapping Italic → bold-italic ***", () => {
    expect(
      render(
        <Bold>
          <Italic>both</Italic>
        </Bold>,
      ),
    ).toBe("***both***");
  });

  test("** in content is escaped to \\*\\*", () => {
    expect(render(<Bold>{"a**b"}</Bold>)).toBe("**a\\*\\*b**");
  });

  test("multiple ** in content — all escaped", () => {
    expect(render(<Bold>{"x ** y ** z"}</Bold>)).toBe("**x \\*\\* y \\*\\* z**");
  });
});

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

describe("Code", () => {
  test("wraps content in backticks", () => {
    expect(render(<Code>inline code</Code>)).toBe("`inline code`");
  });

  test("nested in P alongside Italic", () => {
    expect(
      render(
        <P>
          <Code>fn</Code> returns <Italic>nothing</Italic>
        </P>,
      ),
    ).toBe("`fn` returns *nothing*\n\n");
  });

  test("empty children → ``", () => {
    expect(render(<Code></Code>)).toBe("``");
  });

  test("single backtick in content → double backtick fence", () => {
    expect(render(<Code>{"a`b"}</Code>)).toBe("``a`b``");
  });

  test("double backtick in content → triple backtick fence", () => {
    expect(render(<Code>{"a``b"}</Code>)).toBe("```a``b```");
  });
});

// ---------------------------------------------------------------------------
// Italic
// ---------------------------------------------------------------------------

describe("Italic", () => {
  test("wraps content in *", () => {
    expect(render(<Italic>emphasized</Italic>)).toBe("*emphasized*");
  });

  test("empty children → **", () => {
    expect(render(<Italic></Italic>)).toBe("**");
  });
});

// ---------------------------------------------------------------------------
// Strikethrough
// ---------------------------------------------------------------------------

describe("Strikethrough", () => {
  test("wraps content in ~~", () => {
    expect(render(<Strikethrough>deprecated</Strikethrough>)).toBe("~~deprecated~~");
  });

  test("empty children → ~~~~", () => {
    expect(render(<Strikethrough></Strikethrough>)).toBe("~~~~");
  });

  test("~~ in content is escaped to \\~\\~", () => {
    expect(render(<Strikethrough>{"a~~b"}</Strikethrough>)).toBe("~~a\\~\\~b~~");
  });
});

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

describe("Link", () => {
  test("basic link", () => {
    expect(render(<Link href="https://example.com">click here</Link>)).toBe(
      "[click here](https://example.com)",
    );
  });

  test("nested in P", () => {
    expect(
      render(
        <P>
          See <Link href="https://example.com">the docs</Link> for more.
        </P>,
      ),
    ).toBe("See [the docs](https://example.com) for more.\n\n");
  });

  test(") in href → encoded as %29", () => {
    expect(render(<Link href="https://example.com/a)b">text</Link>)).toBe(
      "[text](https://example.com/a%29b)",
    );
  });

  test("( in href → encoded as %28", () => {
    expect(render(<Link href="https://example.com/a(b">text</Link>)).toBe(
      "[text](https://example.com/a%28b)",
    );
  });

  test("empty children → label is empty", () => {
    expect(render(<Link href="https://example.com"></Link>)).toBe("[](https://example.com)");
  });

  test("formatted label — Code inside Link", () => {
    expect(
      render(
        <Link href="https://example.com">
          <Code>render()</Code>
        </Link>,
      ),
    ).toBe("[`render()`](https://example.com)");
  });
});

// ---------------------------------------------------------------------------
// Img
// ---------------------------------------------------------------------------

describe("Img", () => {
  test("basic image", () => {
    expect(render(<Img src="./diagram.png" alt="architecture" />)).toBe(
      "![architecture](./diagram.png)",
    );
  });

  test("omitted alt defaults to empty", () => {
    expect(render(<Img src="./x.png" />)).toBe("![](./x.png)");
  });

  test(") in src → encoded as %29", () => {
    expect(render(<Img src="img)file.png" alt="alt" />)).toBe("![alt](img%29file.png)");
  });

  test("encodes ] in alt to prevent label closure", () => {
    expect(render(<Img src="img.png" alt="bracket]alt" />)).toBe("![bracket%5Dalt](img.png)");
  });

  test("encodes [ in alt", () => {
    expect(render(<Img src="img.png" alt="[note]" />)).toBe("![%5Bnote%5D](img.png)");
  });

  test("img inside P — no trailing whitespace on img itself", () => {
    expect(
      render(
        <P>
          <Img src="./x.png" alt="fig" /> caption text
        </P>,
      ),
    ).toBe("![fig](./x.png) caption text\n\n");
  });

  test("empty src → src part is empty", () => {
    expect(render(<Img src="" alt="fig" />)).toBe("![fig]()");
  });
});

// ---------------------------------------------------------------------------
// Md (raw passthrough)
// ---------------------------------------------------------------------------

describe("Md", () => {
  test("passes raw string through unchanged", () => {
    expect(render(<Md>{"raw **text**"}</Md>)).toBe("raw **text**");
  });

  test("does not re-render markdown syntax — output is exactly the input", () => {
    const raw = "**P0**: Type = `TKey`. Not `TFuncKey`, not `string`.";
    expect(render(<Md>{raw}</Md>)).toBe(raw);
  });

  test("empty children → empty string", () => {
    expect(render(<Md></Md>)).toBe("");
  });

  test("JSX children are rendered — Md is transparent to render()", () => {
    // Md calls render(children), so JSX children are evaluated normally
    expect(
      render(
        <Md>
          <Bold>x</Bold>
        </Md>,
      ),
    ).toBe("**x**");
  });
});

// ---------------------------------------------------------------------------
// Br (hard line break)
// ---------------------------------------------------------------------------

describe("Br", () => {
  test("produces two trailing spaces + newline", () => {
    expect(render(<Br />)).toBe("  \n");
  });

  test("inside P — prose + Br + prose", () => {
    expect(
      render(
        <P>
          first line
          <Br />
          second line
        </P>,
      ),
    ).toBe("first line  \nsecond line\n\n");
  });
});

// ---------------------------------------------------------------------------
// Sup
// ---------------------------------------------------------------------------

describe("Sup", () => {
  test("wraps content in <sup></sup>", () => {
    expect(render(<Sup>2</Sup>)).toBe("<sup>2</sup>");
  });

  test("text content", () => {
    expect(render(<Sup>th</Sup>)).toBe("<sup>th</sup>");
  });

  test("empty children", () => {
    expect(render(<Sup></Sup>)).toBe("<sup></sup>");
  });

  test("inside P", () => {
    expect(
      render(
        <P>
          x<Sup>2</Sup> + y
        </P>,
      ),
    ).toBe("x<sup>2</sup> + y\n\n");
  });
});

// ---------------------------------------------------------------------------
// Sub
// ---------------------------------------------------------------------------

describe("Sub", () => {
  test("wraps content in <sub></sub>", () => {
    expect(render(<Sub>2</Sub>)).toBe("<sub>2</sub>");
  });

  test("text content", () => {
    expect(render(<Sub>i</Sub>)).toBe("<sub>i</sub>");
  });

  test("empty children", () => {
    expect(render(<Sub></Sub>)).toBe("<sub></sub>");
  });

  test("inside P", () => {
    expect(
      render(
        <P>
          H<Sub>2</Sub>O
        </P>,
      ),
    ).toBe("H<sub>2</sub>O\n\n");
  });
});

// ---------------------------------------------------------------------------
// Kbd
// ---------------------------------------------------------------------------

describe("Kbd", () => {
  test("wraps content in <kbd></kbd>", () => {
    expect(render(<Kbd>Ctrl+C</Kbd>)).toBe("<kbd>Ctrl+C</kbd>");
  });

  test("empty children", () => {
    expect(render(<Kbd></Kbd>)).toBe("<kbd></kbd>");
  });

  test("inside P", () => {
    expect(
      render(
        <P>
          Press <Kbd>Enter</Kbd> to continue.
        </P>,
      ),
    ).toBe("Press <kbd>Enter</kbd> to continue.\n\n");
  });
});

// ---------------------------------------------------------------------------
// Escape
// ---------------------------------------------------------------------------

describe("Escape", () => {
  test("plain text passes through unchanged", () => {
    expect(render(<Escape>hello world</Escape>)).toBe("hello world");
  });

  test("** is escaped", () => {
    expect(render(<Escape>{"**bold**"}</Escape>)).toBe("\\*\\*bold\\*\\*");
  });

  test("_italic_ is escaped", () => {
    expect(render(<Escape>{"_italic_"}</Escape>)).toBe("\\_italic\\_");
  });

  test("[link](url) metacharacters are escaped", () => {
    expect(render(<Escape>{"[link](url)"}</Escape>)).toBe("\\[link\\]\\(url\\)");
  });

  test("inside P — untrusted filename is safe", () => {
    expect(
      render(
        <P>
          File: <Escape>{"**danger**.md"}</Escape>
        </P>,
      ),
    ).toBe("File: \\*\\*danger\\*\\*\\.md\n\n");
  });
});
