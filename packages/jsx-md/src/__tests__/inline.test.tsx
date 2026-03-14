/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { P, Bold, Code, Italic, Strikethrough, Link, Img, Md } from '../index.ts';

// ---------------------------------------------------------------------------
// Bold
// ---------------------------------------------------------------------------

describe('Bold', () => {
  test('wraps content in **', () => {
    expect(render(<Bold>important</Bold>)).toBe('**important**');
  });

  test('nested in P', () => {
    expect(render(<P><Bold>hello</Bold> world</P>)).toBe('**hello** world\n\n');
  });

  test('empty children → ****', () => {
    expect(render(<Bold></Bold>)).toBe('****');
  });

  test('wrapping Italic → bold-italic ***', () => {
    expect(render(<Bold><Italic>both</Italic></Bold>)).toBe('***both***');
  });
});

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

describe('Code', () => {
  test('wraps content in backticks', () => {
    expect(render(<Code>inline code</Code>)).toBe('`inline code`');
  });

  test('nested in P alongside Italic', () => {
    expect(render(<P><Code>fn</Code> returns <Italic>nothing</Italic></P>)).toBe('`fn` returns *nothing*\n\n');
  });

  test('empty children → ``', () => {
    expect(render(<Code></Code>)).toBe('``');
  });
});

// ---------------------------------------------------------------------------
// Italic
// ---------------------------------------------------------------------------

describe('Italic', () => {
  test('wraps content in *', () => {
    expect(render(<Italic>emphasized</Italic>)).toBe('*emphasized*');
  });

  test('empty children → **', () => {
    expect(render(<Italic></Italic>)).toBe('**');
  });
});

// ---------------------------------------------------------------------------
// Strikethrough
// ---------------------------------------------------------------------------

describe('Strikethrough', () => {
  test('wraps content in ~~', () => {
    expect(render(<Strikethrough>deprecated</Strikethrough>)).toBe('~~deprecated~~');
  });

  test('empty children → ~~~~', () => {
    expect(render(<Strikethrough></Strikethrough>)).toBe('~~~~');
  });
});

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

describe('Link', () => {
  test('basic link', () => {
    expect(render(<Link href="https://example.com">click here</Link>)).toBe('[click here](https://example.com)');
  });

  test('nested in P', () => {
    expect(render(
      <P>See <Link href="https://example.com">the docs</Link> for more.</P>
    )).toBe('See [the docs](https://example.com) for more.\n\n');
  });

  test(') in href → encoded as %29', () => {
    expect(render(<Link href="https://example.com/a)b">text</Link>)).toBe('[text](https://example.com/a%29b)');
  });

  test('( in href → encoded as %28', () => {
    expect(render(<Link href="https://example.com/a(b">text</Link>)).toBe('[text](https://example.com/a%28b)');
  });

  test('empty children → label is empty', () => {
    expect(render(<Link href="https://example.com"></Link>)).toBe('[](https://example.com)');
  });

  test('formatted label — Code inside Link', () => {
    expect(render(<Link href="https://example.com"><Code>render()</Code></Link>)).toBe('[`render()`](https://example.com)');
  });
});

// ---------------------------------------------------------------------------
// Img
// ---------------------------------------------------------------------------

describe('Img', () => {
  test('basic image', () => {
    expect(render(<Img src="./diagram.png" alt="architecture" />)).toBe('![architecture](./diagram.png)');
  });

  test('omitted alt defaults to empty', () => {
    expect(render(<Img src="./x.png" />)).toBe('![](./x.png)');
  });

  test(') in src → encoded as %29', () => {
    expect(render(<Img src="img)file.png" alt="alt" />)).toBe('![alt](img%29file.png)');
  });

  test('encodes ] in alt to prevent label closure', () => {
    expect(render(<Img src="img.png" alt="bracket]alt" />)).toBe('![bracket%5Dalt](img.png)');
  });

  test('encodes [ in alt', () => {
    expect(render(<Img src="img.png" alt="[note]" />)).toBe('![%5Bnote%5D](img.png)');
  });

  test('img inside P — no trailing whitespace on img itself', () => {
    expect(render(<P><Img src="./x.png" alt="fig" /> caption text</P>)).toBe('![fig](./x.png) caption text\n\n');
  });

  test('empty src → src part is empty', () => {
    expect(render(<Img src="" alt="fig" />)).toBe('![fig]()');
  });
});

// ---------------------------------------------------------------------------
// Md (raw passthrough)
// ---------------------------------------------------------------------------

describe('Md', () => {
  test('passes raw string through unchanged', () => {
    expect(render(<Md>{'raw **text**'}</Md>)).toBe('raw **text**');
  });

  test('does not re-render markdown syntax — output is exactly the input', () => {
    const raw = '**P0**: Type = `TKey`. Not `TFuncKey`, not `string`.';
    expect(render(<Md>{raw}</Md>)).toBe(raw);
  });

  test('empty children → empty string', () => {
    expect(render(<Md></Md>)).toBe('');
  });

  test('JSX children are rendered — Md is transparent to render()', () => {
    // Md calls render(children), so JSX children are evaluated normally
    expect(render(<Md><Bold>x</Bold></Md>)).toBe('**x**');
  });
});
