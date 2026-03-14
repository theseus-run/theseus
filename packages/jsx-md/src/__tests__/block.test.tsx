/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { H1, H2, H3, H4, H5, H6, P, Hr, Codeblock, Blockquote, Ul, Li, Strikethrough, Bold, Code, Italic, Callout } from '../index.ts';

// ---------------------------------------------------------------------------
// Headings
// ---------------------------------------------------------------------------

describe('headings', () => {
  test('H1', () => {
    expect(render(<H1>hello world</H1>)).toBe('# hello world\n\n');
  });

  test('H2', () => {
    expect(render(<H2>section title</H2>)).toBe('## section title\n\n');
  });

  test('H3', () => {
    expect(render(<H3>subsection</H3>)).toBe('### subsection\n\n');
  });

  test('H4', () => {
    expect(render(<H4>minor heading</H4>)).toBe('#### minor heading\n\n');
  });

  test('H5', () => {
    expect(render(<H5>heading</H5>)).toBe('##### heading\n\n');
  });

  test('H6', () => {
    expect(render(<H6>heading</H6>)).toBe('###### heading\n\n');
  });

  test('H1 with inline children', () => {
    expect(render(<H1><Bold>bold title</Bold></H1>)).toBe('# **bold title**\n\n');
  });

  test('H2 with mixed inline children', () => {
    expect(render(<H2><Code>fn</Code> returns <Italic>value</Italic></H2>)).toBe('## `fn` returns *value*\n\n');
  });
});

// ---------------------------------------------------------------------------
// P
// ---------------------------------------------------------------------------

describe('P', () => {
  test('plain text', () => {
    expect(render(<P>some prose text</P>)).toBe('some prose text\n\n');
  });

  test('null child renders as blank paragraph', () => {
    expect(render(<P>{null}</P>)).toBe('\n\n');
  });

  test('false child renders as blank paragraph', () => {
    expect(render(<P>{false}</P>)).toBe('\n\n');
  });

  test('numeric child renders as string', () => {
    expect(render(<P>{42}</P>)).toBe('42\n\n');
  });

  test('mixed inline children', () => {
    expect(render(<P><Bold>x</Bold> and <Italic>y</Italic></P>)).toBe('**x** and *y*\n\n');
  });
});

// ---------------------------------------------------------------------------
// Hr
// ---------------------------------------------------------------------------

describe('Hr', () => {
  test('renders as --- separator', () => {
    expect(render(<Hr />)).toBe('---\n\n');
  });
});

// ---------------------------------------------------------------------------
// Codeblock
// ---------------------------------------------------------------------------

describe('Codeblock', () => {
  test('no lang — plain fence', () => {
    expect(render(<Codeblock>{'const x = 1'}</Codeblock>)).toBe('```\nconst x = 1\n```\n\n');
  });

  test('with lang — fence tagged', () => {
    expect(render(<Codeblock lang="ts">{'const x = 1'}</Codeblock>)).toBe('```ts\nconst x = 1\n```\n\n');
  });

  test('with indent — body lines indented, fences at column 0', () => {
    const result = render(<Codeblock lang="ts" indent={2}>{'const x = 1'}</Codeblock>);
    expect(result).toBe('```ts\n  const x = 1\n```\n\n');
  });

  test('multiline content — each line indented when indent set', () => {
    const result = render(<Codeblock lang="py" indent={4}>{'a = 1\nb = 2'}</Codeblock>);
    expect(result).toBe('```py\n    a = 1\n    b = 2\n```\n\n');
  });

  test('trailing newline in content is stripped before closing fence', () => {
    // A trailing \n in the content string should not create a blank indented
    // line before the closing ```.
    const result = render(<Codeblock lang="ts" indent={2}>{'const x = 1\n'}</Codeblock>);
    expect(result).toBe('```ts\n  const x = 1\n```\n\n');
  });

  test('empty content — fence with no body lines', () => {
    expect(render(<Codeblock></Codeblock>)).toBe('```\n\n```\n\n');
  });

  test('content that is only blank lines — all stripped before closing fence', () => {
    // Each empty line is popped; nothing remains → same as empty content
    expect(render(<Codeblock>{'\n\n'}</Codeblock>)).toBe('```\n\n```\n\n');
  });
});

// ---------------------------------------------------------------------------
// Blockquote
// ---------------------------------------------------------------------------

describe('Blockquote', () => {
  test('single line of text', () => {
    expect(render(<Blockquote>note this</Blockquote>)).toBe('> note this\n\n');
  });

  test('block children — empty lines become bare >', () => {
    expect(render(
      <Blockquote><P>paragraph one</P><P>paragraph two</P></Blockquote>
    )).toBe('> paragraph one\n>\n> paragraph two\n\n');
  });

  test('nested blockquotes', () => {
    expect(render(
      <Blockquote><Blockquote>inner</Blockquote></Blockquote>
    )).toBe('> > inner\n\n');
  });

  test('inline element inside list item inside blockquote', () => {
    expect(render(
      <Blockquote>
        <Ul><Li><Strikethrough>old item</Strikethrough></Li></Ul>
      </Blockquote>
    )).toBe('> - ~~old item~~\n\n');
  });

  test('empty children — single bare > line', () => {
    // trimEnd on '' = '', split gives [''], empty line maps to bare '>'
    expect(render(<Blockquote></Blockquote>)).toBe('>\n\n');
  });

  test('wrapping a Codeblock — fence lines get > prefix', () => {
    expect(render(
      <Blockquote><Codeblock lang="ts">{'const x = 1'}</Codeblock></Blockquote>
    )).toBe('> ```ts\n> const x = 1\n> ```\n\n');
  });

  test('wrapping a Callout — produces double > > prefix', () => {
    expect(render(
      <Blockquote><Callout type="warning">watch out</Callout></Blockquote>
    )).toBe('> > [!WARNING]\n> > watch out\n\n');
  });
});
