/**
 * Snapshot tests for jsx-md VNode render pipeline.
 *
 * IMPORTANT: render must be imported before any JSX that uses Fragment,
 * because Fragment calls _renderFn which is registered by render.ts on import.
 */

/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';

// render must be imported first to register _renderFn with Fragment
import { render, createContext, withContext, useContext } from '../index.ts';
import type { VNode } from '../index.ts';
import {
  H1, H2, H3, H4, H5, H6,
  P,
  Hr,
  Codeblock,
  Blockquote,
  Li, Ul, Ol,
  Bold, Code, Italic, Strikethrough, Link, Img,
  Md,
  Table, Tr, Th, Td,
  TaskList, Task,
  Callout,
  HtmlComment,
  Details,
} from '../index.ts';

// ---------------------------------------------------------------------------
// Block primitives — basic smoke tests
// ---------------------------------------------------------------------------

describe('block primitives', () => {
  test('H1', () => {
    expect(render(<H1>hello world</H1>)).toMatchSnapshot();
  });

  test('H2', () => {
    expect(render(<H2>section title</H2>)).toMatchSnapshot();
  });

  test('H3', () => {
    expect(render(<H3>subsection</H3>)).toMatchSnapshot();
  });

  test('H4', () => {
    expect(render(<H4>minor heading</H4>)).toMatchSnapshot();
  });

  test('H5', () => {
    expect(render(<H5>heading</H5>)).toMatchSnapshot();
  });

  test('H6', () => {
    expect(render(<H6>heading</H6>)).toMatchSnapshot();
  });

  test('P', () => {
    expect(render(<P>some prose text</P>)).toMatchSnapshot();
  });

  test('Hr', () => {
    expect(render(<Hr />)).toMatchSnapshot();
  });

  test('Codeblock no lang', () => {
    expect(render(<Codeblock>{'const x = 1'}</Codeblock>)).toMatchSnapshot();
  });

  test('Codeblock with lang', () => {
    expect(render(<Codeblock lang="ts">{'const x = 1'}</Codeblock>)).toMatchSnapshot();
  });

  test('Codeblock with indent', () => {
    const result = render(<Codeblock lang="ts" indent={2}>{'const x = 1'}</Codeblock>);
    // Body lines are indented; opening and closing fences must be at column 0.
    expect(result).toMatchSnapshot();
    const lines = result.split('\n');
    expect(lines[0]).toBe('```ts');
    // Closing fence is the last non-empty line
    expect(lines.filter(l => l.length > 0).at(-1)).toBe('```');
  });
});

// ---------------------------------------------------------------------------
// Inline primitives — basic smoke tests
// ---------------------------------------------------------------------------

describe('inline primitives', () => {
  test('Bold', () => {
    expect(render(<Bold>important</Bold>)).toMatchSnapshot();
  });

  test('Code', () => {
    expect(render(<Code>inline code</Code>)).toMatchSnapshot();
  });

  test('Italic', () => {
    expect(render(<Italic>emphasized</Italic>)).toMatchSnapshot();
  });

  test('Link', () => {
    expect(render(<Link href="https://example.com">click here</Link>)).toMatchSnapshot();
  });

  test('Link encodes ) in href to prevent link termination', () => {
    expect(render(<Link href="https://example.com/a)b">text</Link>)).toMatchSnapshot();
  });

  test('Strikethrough', () => {
    expect(render(<Strikethrough>deprecated</Strikethrough>)).toMatchSnapshot();
  });

  test('Img', () => {
    expect(render(<Img src="./diagram.png" alt="architecture" />)).toMatchSnapshot();
  });

  test('Img encodes ) in src', () => {
    expect(render(<Img src="img)file.png" alt="alt" />)).toMatchSnapshot();
  });

  test('Img encodes ] in alt to prevent label closure', () => {
    expect(render(<Img src="img.png" alt="bracket]alt" />)).toMatchSnapshot();
  });

  test('Img in paragraph', () => {
    expect(render(<P><Img src="./x.png" alt="fig" /> caption text</P>)).toMatchSnapshot();
  });

  test('Md passthrough', () => {
    expect(render(<Md>{'raw **text** with `code`'}</Md>)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Blockquote
// ---------------------------------------------------------------------------

describe('Blockquote', () => {
  test('single line', () => {
    expect(render(<Blockquote>note this</Blockquote>)).toMatchSnapshot();
  });

  test('with block children', () => {
    expect(render(
      <Blockquote><P>paragraph one</P><P>paragraph two</P></Blockquote>
    )).toMatchSnapshot();
  });

  test('nested blockquotes', () => {
    expect(render(
      <Blockquote><Blockquote>inner</Blockquote></Blockquote>
    )).toMatchSnapshot();
  });

  test('Strikethrough in list item', () => {
    expect(render(
      <Ul><Li><Strikethrough>old item</Strikethrough></Li></Ul>
    )).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Composition — inline nested in block
// ---------------------------------------------------------------------------

describe('composition', () => {
  test('Bold nested in P', () => {
    expect(render(<P><Bold>hello</Bold> world</P>)).toMatchSnapshot();
  });

  test('Code and Italic nested in P', () => {
    expect(render(<P><Code>fn</Code> returns <Italic>nothing</Italic></P>)).toMatchSnapshot();
  });

  test('Link nested in P', () => {
    expect(render(<P>See <Link href="https://example.com">the docs</Link> for more.</P>)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// List primitives — flat
// ---------------------------------------------------------------------------

describe('flat lists', () => {
  test('Ul with Li items', () => {
    expect(render(
      <Ul>
        <Li>alpha</Li>
        <Li>beta</Li>
        <Li>gamma</Li>
      </Ul>
    )).toMatchSnapshot();
  });

  test('Ol with Li items', () => {
    expect(render(
      <Ol>
        <Li>first step</Li>
        <Li>second step</Li>
        <Li>third step</Li>
      </Ol>
    )).toMatchSnapshot();
  });

  test('Li outside list (depth=0)', () => {
    // Li outside Ul/Ol: depth=0, indent=''.repeat(-1)='' → "- item\n"
    expect(render(<Li>standalone item</Li>)).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Nested lists
// ---------------------------------------------------------------------------

describe('nested lists', () => {
  test('Ul nested in Ul', () => {
    expect(render(
      <Ul>
        <Li>top</Li>
        <Ul>
          <Li>sub</Li>
        </Ul>
      </Ul>
    )).toMatchSnapshot();
  });

  test('Ul two levels deep', () => {
    expect(render(
      <Ul>
        <Li>top</Li>
        <Ul>
          <Li>mid</Li>
          <Ul>
            <Li>deep</Li>
          </Ul>
        </Ul>
      </Ul>
    )).toMatchSnapshot();
  });

  test('Ol with nested Ul', () => {
    // Known limitation: nested list's first item appears inline with parent Li text.
    // This matches the same behavior as nested Ul inside Ul (Li limitation).
    // The snapshot intentionally captures this behavior.
    expect(render(
      <Ol>
        <Li>first</Li>
        <Li>second
          <Ul>
            <Li>sub-a</Li>
            <Li>sub-b</Li>
          </Ul>
        </Li>
      </Ol>
    )).toMatchSnapshot();
  });

  test('Li with inline formatting nested in Ul', () => {
    expect(render(
      <Ul>
        <Li><Bold>important</Bold>: do this</Li>
        <Li><Code>fn()</Code> — calls the function</Li>
      </Ul>
    )).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

describe('Fragment', () => {
  test('Fragment with multiple block children', () => {
    expect(render(
      <>
        <P>first paragraph</P>
        <P>second paragraph</P>
      </>
    )).toMatchSnapshot();
  });

  test('Fragment with mixed children', () => {
    expect(render(
      <>
        <H2>title</H2>
        <P>body</P>
        <Hr />
      </>
    )).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Null / falsy children
// ---------------------------------------------------------------------------

describe('null and falsy children', () => {
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

  test('P with null child', () => {
    expect(render(<P>{null}</P>)).toBe('\n\n');
  });

  test('P with false child', () => {
    expect(render(<P>{false}</P>)).toBe('\n\n');
  });
});

// ---------------------------------------------------------------------------
// Custom context round-trip
// ---------------------------------------------------------------------------

describe('custom context', () => {
  test('createContext / useContext / withContext round-trip', () => {
    const ThemeContext = createContext('light');

    function ThemedBox({ children }: { children?: VNode }): string {
      const theme = useContext(ThemeContext);
      return `[${theme}] ${render(children ?? null)}`;
    }

    const result = withContext(ThemeContext, 'dark', () =>
      render(<ThemedBox>content</ThemedBox>)
    );
    expect(result).toBe('[dark] content');
  });

  test('nested withContext uses innermost value', () => {
    const LevelContext = createContext(0);

    function ShowLevel(): string {
      return String(useContext(LevelContext));
    }

    const outer = withContext(LevelContext, 1, () =>
      withContext(LevelContext, 2, () =>
        render(<ShowLevel />)
      )
    );
    expect(outer).toBe('2');
  });

  test('withContext restores default after fn returns', () => {
    const ctx = createContext('default');

    withContext(ctx, 'overridden', () => 'discarded');
    expect(useContext(ctx)).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// Md escape hatch
// ---------------------------------------------------------------------------

describe('Md', () => {
  test('Md passes raw string through unchanged', () => {
    expect(render(<Md>{'raw **text**'}</Md>)).toBe('raw **text**');
  });

  test('Md with complex inline', () => {
    expect(render(
      <Md>{'**P0**: Type = `TKey`. Not `TFuncKey`, not `string`.'}
      </Md>
    )).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Ol constraints
// ---------------------------------------------------------------------------

describe('Ol constraints', () => {
  test('Ol nested directly in Ol throws', () => {
    expect(() =>
      render(
        <Ol>
          <Li>outer</Li>
          <Ol>
            <Li>inner</Li>
          </Ol>
        </Ol>
      )
    ).toThrow('Ol cannot be used inside any list container (Ul, Ol, or TaskList) — depth must be 0.');
  });

  test('Ol nested directly in Ul throws', () => {
    expect(() =>
      render(
        <Ul>
          <Li>item</Li>
          <Ol>
            <Li>numbered sub</Li>
          </Ol>
        </Ul>
      )
    ).toThrow('Ol cannot be used inside any list container (Ul, Ol, or TaskList) — depth must be 0.');
  });

  test('Ol inside Li inside Ul throws — Ol requires depth 0', () => {
    // Ol checks DepthContext on entry. Inside a Ul, depth is already 1 by the
    // time Li children are rendered, so Ol sees depth=1 and throws.
    expect(() =>
      render(
        <Ul>
          <Li>step
            <Ol><Li>sub</Li></Ol>
          </Li>
        </Ul>
      )
    ).toThrow('Ol cannot be used inside any list container');
  });
});

// ---------------------------------------------------------------------------
// Fragment guard
// ---------------------------------------------------------------------------

describe('Fragment guard', () => {
  test('Fragment is safe when render is imported before JSX evaluation', () => {
    // Documents the contract: Fragment requires render.ts to be imported.
    // The throw guard (when _render is null) cannot be exercised here because
    // bun:test does not support module re-initialization. Verified by code review.
    expect(() => render(<><P>test</P></>)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Context error recovery
// ---------------------------------------------------------------------------

describe('context error recovery', () => {
  test('withContext stack is clean after component throws', () => {
    const ThrowCtx = createContext(0);

    expect(() => {
      withContext(ThrowCtx, 42, () => {
        throw new Error('render error');
      });
    }).toThrow('render error');

    // Stack must be clean — useContext returns default after the throw
    expect(useContext(ThrowCtx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

describe('Table', () => {
  test('basic two-column table', () => {
    expect(render(
      <Table>
        <Tr><Th>Agent</Th><Th>Role</Th></Tr>
        <Tr><Td>Theseus</Td><Td>Orchestrator</Td></Tr>
        <Tr><Td>Forge</Td><Td>Implementer</Td></Tr>
      </Table>
    )).toMatchSnapshot();
  });

  test('table with inline formatting in cells', () => {
    expect(render(
      <Table>
        <Tr><Th>Name</Th><Th>Type</Th></Tr>
        <Tr><Td><Bold>Theseus</Bold></Td><Td><Code>Orchestrator</Code></Td></Tr>
      </Table>
    )).toMatchSnapshot();
  });

  test('single-column table', () => {
    expect(render(
      <Table>
        <Tr><Th>Item</Th></Tr>
        <Tr><Td>one</Td></Tr>
        <Tr><Td>two</Td></Tr>
      </Table>
    )).toMatchSnapshot();
  });

  test('header only (no body rows)', () => {
    expect(render(
      <Table>
        <Tr><Th>Col A</Th><Th>Col B</Th></Tr>
      </Table>
    )).toMatchSnapshot();
  });

  test('Td with pipe character in content — pipe is not escaped (known limitation)', () => {
    const result = render(
      <Table>
        <Tr><Th>A</Th><Th>B</Th></Tr>
        <Tr><Td>{'has | pipe'}</Td><Td>normal</Td></Tr>
      </Table>
    )
    // Pipe in content is not escaped — this produces a broken GFM table.
    // Callers must escape pipes in cell content manually.
    expect(result).toContain('has | pipe')
  })
});

// ---------------------------------------------------------------------------
// XML tags
// ---------------------------------------------------------------------------

describe('XML tags', () => {
  test('self-closing — no children', () => {
    expect(render(<br />)).toMatchSnapshot();
  });

  test('simple text content', () => {
    expect(render(<task>do the thing</task>)).toMatchSnapshot();
  });

  test('markdown children inside XML', () => {
    expect(render(
      <task>
        <P>Do X.</P>
        <Ul><Li>step</Li></Ul>
      </task>
    )).toMatchSnapshot();
  });

  test('string attributes', () => {
    expect(render(
      <task type="summary" priority="high">content</task>
    )).toMatchSnapshot();
  });

  test('boolean attribute renders as bare name', () => {
    expect(render(
      <task required>content</task>
    )).toMatchSnapshot();
  });

  test('nested XML tags', () => {
    expect(render(
      <context>
        <task>inner</task>
      </context>
    )).toMatchSnapshot();
  });

  test('XML wrapper around markdown primitives', () => {
    expect(render(
      <instructions>
        <H2>Rules</H2>
        <Ul>
          <Li>be concise</Li>
          <Li>use examples</Li>
        </Ul>
      </instructions>
    )).toMatchSnapshot();
  });

  test('escapes special characters in attribute values', () => {
    const result = render(<task type='a"b' label="x & y" />);
    expect(result).toMatchSnapshot();
  });

  test('renders non-self-closing when children are whitespace-only', () => {
    const result = render(<task>{'\n'}</task>);
    expect(result).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TaskList + Task
// ---------------------------------------------------------------------------

describe('TaskList + Task', () => {
  test('single unchecked item', () => {
    expect(render(
      <TaskList>
        <Task>buy milk</Task>
      </TaskList>
    )).toMatchSnapshot();
  });

  test('single checked item (done prop)', () => {
    expect(render(
      <TaskList>
        <Task done>buy milk</Task>
      </TaskList>
    )).toMatchSnapshot();
  });

  test('multiple items mixed checked/unchecked', () => {
    expect(render(
      <TaskList>
        <Task done>write tests</Task>
        <Task>update docs</Task>
        <Task done>fix bug</Task>
        <Task>deploy</Task>
      </TaskList>
    )).toMatchSnapshot();
  });

  test('nested TaskList inside TaskList', () => {
    expect(render(
      <TaskList>
        <Task done>outer done</Task>
        <Task>outer unchecked
          <TaskList>
            <Task done>inner done</Task>
            <Task>inner unchecked</Task>
          </TaskList>
        </Task>
      </TaskList>
    )).toMatchSnapshot();
  });

  test('Task outside TaskList (depth=0) — no crash, no negative indent', () => {
    const result = render(<Task>standalone</Task>);
    expect(result).toBe('- [ ] standalone\n');
  });
});

// ---------------------------------------------------------------------------
// Callout
// ---------------------------------------------------------------------------

describe('Callout', () => {
  test('type="note" with simple text', () => {
    expect(render(
      <Callout type="note">this is a note</Callout>
    )).toMatchSnapshot();
  });

  test('type="warning" with simple text', () => {
    expect(render(
      <Callout type="warning">be careful here</Callout>
    )).toMatchSnapshot();
  });

  test('type="important" with multi-line children', () => {
    expect(render(
      <Callout type="important">
        <P>Read this carefully.</P>
        <Ul>
          <Li>step one</Li>
          <Li>step two</Li>
        </Ul>
      </Callout>
    )).toMatchSnapshot();
  });

  test('type note renders > [!NOTE]', () => {
    expect(render(<Callout type="note">content</Callout>)).toMatchSnapshot();
  });

  test('type tip renders > [!TIP]', () => {
    expect(render(<Callout type="tip">content</Callout>)).toMatchSnapshot();
  });

  test('type important renders > [!IMPORTANT]', () => {
    expect(render(<Callout type="important">content</Callout>)).toMatchSnapshot();
  });

  test('type warning renders > [!WARNING]', () => {
    expect(render(<Callout type="warning">content</Callout>)).toMatchSnapshot();
  });

  test('type caution renders > [!CAUTION]', () => {
    expect(render(<Callout type="caution">content</Callout>)).toMatchSnapshot();
  });

  test('Callout followed by P has blank line separator', () => {
    expect(render(
      <>
        <Callout type="note">heads up</Callout>
        <P>after the callout</P>
      </>
    )).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// HtmlComment
// ---------------------------------------------------------------------------

describe('HtmlComment', () => {
  test('single-line content', () => {
    expect(render(<HtmlComment>this is a comment</HtmlComment>)).toMatchSnapshot();
  });

  test('multi-line string content', () => {
    expect(render(<HtmlComment>{'line one\nline two'}</HtmlComment>)).toMatchSnapshot();
  });

  test('children that render to multi-line (two P components)', () => {
    expect(render(
      <HtmlComment>
        <P>first paragraph</P>
        <P>second paragraph</P>
      </HtmlComment>
    )).toMatchSnapshot();
  });

  test('no children renders <!-- --> with single space each side', () => {
    const result = render(<HtmlComment />);
    expect(result).toBe('<!-- -->\n');
  });

  test('HtmlComment with double-dash in content — not escaped (known behavior)', () => {
    const result = render(<HtmlComment>{'some -- comment'}</HtmlComment>)
    // Double-dash inside HTML comments is technically invalid HTML,
    // but we do not escape it — callers are responsible for valid content.
    expect(result).toBe('<!-- some -- comment -->\n')
  })
});

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

describe('Details', () => {
  test('basic: summary string + simple paragraph body', () => {
    expect(render(
      <Details summary="Click to expand">
        <P>This is the body content.</P>
      </Details>
    )).toMatchSnapshot();
  });

  test('summary + markdown-rich body (H2 + Ul)', () => {
    expect(render(
      <Details summary="Implementation notes">
        <H2>Steps</H2>
        <Ul>
          <Li>read the spec</Li>
          <Li>write the code</Li>
          <Li>run the tests</Li>
        </Ul>
      </Details>
    )).toMatchSnapshot();
  });

  test('blank line after </summary> is present in output', () => {
    const result = render(
      <Details summary="See more">
        <P>body</P>
      </Details>
    );
    expect(result).toMatchSnapshot();
    // Verify the structural requirement explicitly
    expect(result).toContain('</summary>\n\n');
  });

  test('summary with special characters is HTML-escaped', () => {
    expect(render(
      <Details summary="A & B <note>">
        <P>body</P>
      </Details>
    )).toMatchSnapshot();
  });
});
