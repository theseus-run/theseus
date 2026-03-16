/**
 * Composition tests for jsx-md.
 *
 * These tests verify that user-defined function components compose correctly:
 * components that return JSX (Fragment or element) must recurse through
 * render() so the final output is always a string.
 *
 * Every assertion is positive and explicit — we assert what the output IS,
 * not what it is not.
 */

/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';

// render must be imported first to register _renderFn with Fragment
import { render, createContext, withContext, useContext } from '../index.ts';
import type { VNode } from '../index.ts';
import {
  H1, H2, H3,
  P, Hr,
  Ul, Ol, Li,
  Bold, Code, Italic, Link,
  Blockquote, Codeblock,
  Table, Tr, Th, Td,
  Callout, Details,
  HtmlComment,
} from '../index.ts';

// ---------------------------------------------------------------------------
// Return-value dispatch
// Covers every VNode type a component can return at the top of render().
// ---------------------------------------------------------------------------

describe('return-value dispatch', () => {
  test('component returning a plain string', () => {
    function Label(): string {
      return 'hello';
    }
    expect(render(<Label />)).toBe('hello');
  });

  test('component returning a single primitive element', () => {
    function Title(): VNode {
      return <H2>my title</H2>;
    }
    expect(render(<Title />)).toBe('## my title\n\n');
  });

  test('component returning a Fragment', () => {
    function Block(): VNode {
      return (
        <>
          <H2>heading</H2>
          <P>body</P>
        </>
      );
    }
    expect(render(<Block />)).toBe('## heading\n\nbody\n\n');
  });

  test('component returning null renders empty string', () => {
    function Empty(): VNode {
      return null;
    }
    expect(render(<Empty />)).toBe('');
  });

  test('component returning false renders empty string', () => {
    function Hidden(): VNode {
      return false;
    }
    expect(render(<Hidden />)).toBe('');
  });

  test('component conditionally returning null or JSX', () => {
    function MaybeSection({ show }: { show: boolean }): VNode {
      if (!show) return null;
      return <P>visible</P>;
    }
    expect(render(<MaybeSection show={false} />)).toBe('');
    expect(render(<MaybeSection show={true} />)).toBe('visible\n\n');
  });
});

// ---------------------------------------------------------------------------
// Component-to-component depth
// Verifies render() recurses through arbitrarily deep component trees.
// ---------------------------------------------------------------------------

describe('component-to-component depth', () => {
  test('two-level chain: A renders B', () => {
    function Inner(): VNode {
      return <P>inner</P>;
    }
    function Outer(): VNode {
      return (
        <>
          <H2>outer</H2>
          <Inner />
        </>
      );
    }
    expect(render(<Outer />)).toBe('## outer\n\ninner\n\n');
  });

  test('three-level chain: A renders B renders C', () => {
    function C(): VNode {
      return <P>deep</P>;
    }
    function B(): VNode {
      return (
        <>
          <H3>mid</H3>
          <C />
        </>
      );
    }
    function A(): VNode {
      return (
        <>
          <H2>top</H2>
          <B />
        </>
      );
    }
    expect(render(<A />)).toBe('## top\n\n### mid\n\ndeep\n\n');
  });

  test('branching: A renders B and C side by side', () => {
    function B(): VNode {
      return <P>left</P>;
    }
    function C(): VNode {
      return <P>right</P>;
    }
    function A(): VNode {
      return (
        <>
          <B />
          <C />
        </>
      );
    }
    expect(render(<A />)).toBe('left\n\nright\n\n');
  });

  test('same component rendered multiple times in one tree', () => {
    function Tag(): VNode {
      return <P>item</P>;
    }
    function List(): VNode {
      return (
        <>
          <Tag />
          <Tag />
          <Tag />
        </>
      );
    }
    expect(render(<List />)).toBe('item\n\nitem\n\nitem\n\n');
  });

  test('diamond: A calls B and C, both call D', () => {
    function D(): VNode {
      return <P>shared</P>;
    }
    function B(): VNode {
      return (
        <>
          <H3>B</H3>
          <D />
        </>
      );
    }
    function C(): VNode {
      return (
        <>
          <H3>C</H3>
          <D />
        </>
      );
    }
    function A(): VNode {
      return (
        <>
          <B />
          <C />
        </>
      );
    }
    expect(render(<A />)).toBe('### B\n\nshared\n\n### C\n\nshared\n\n');
  });
});

// ---------------------------------------------------------------------------
// Components as children
// A component is passed as a child to a primitive or another component.
// ---------------------------------------------------------------------------

describe('components as children', () => {
  test('component as sole child of a block primitive', () => {
    function Label(): string {
      return 'world';
    }
    // H1 renders its children via render(children), so Label must be resolved.
    expect(render(<H1><Label /></H1>)).toBe('# world\n\n');
  });

  test('multiple components as siblings inside a block primitive', () => {
    function A(): string { return 'foo'; }
    function B(): string { return 'bar'; }
    expect(render(<P><A /> <B /></P>)).toBe('foo bar\n\n');
  });

  test('component alongside literal text inside an inline', () => {
    function Keyword(): string { return 'render'; }
    expect(render(<P>call <Code><Keyword /></Code> here</P>)).toBe('call `render` here\n\n');
  });

  test('component as child of another component that wraps children', () => {
    function Inner(): VNode {
      return <Bold>important</Bold>;
    }
    function Wrapper({ children }: { children?: VNode }): VNode {
      return <P>{children}</P>;
    }
    expect(render(<Wrapper><Inner /></Wrapper>)).toBe('**important**\n\n');
  });

  test('component child inside Blockquote', () => {
    function Notice(): VNode {
      return (
        <>
          <P>line one</P>
          <P>line two</P>
        </>
      );
    }
    expect(render(<Blockquote><Notice /></Blockquote>)).toBe('> line one\n>\n> line two\n\n');
  });
});

// ---------------------------------------------------------------------------
// Props-driven composition
// Components produce different output depending on props.
// ---------------------------------------------------------------------------

describe('props-driven composition', () => {
  test('required string prop flows through to output', () => {
    function Section({ title }: { title: string }): VNode {
      return <H2>{title}</H2>;
    }
    expect(render(<Section title="Overview" />)).toBe('## Overview\n\n');
  });

  test('optional prop with default value', () => {
    function Tag({ label = 'default' }: { label?: string }): string {
      return label;
    }
    expect(render(<Tag />)).toBe('default');
    expect(render(<Tag label="custom" />)).toBe('custom');
  });

  test('boolean prop switches output structure', () => {
    function Status({ ok }: { ok: boolean }): VNode {
      return ok
        ? <P>all good</P>
        : (
          <>
            <H3>Error</H3>
            <P>something went wrong</P>
          </>
        );
    }
    expect(render(<Status ok={true} />)).toBe('all good\n\n');
    expect(render(<Status ok={false} />)).toBe('### Error\n\nsomething went wrong\n\n');
  });

  test('data array mapped to list items', () => {
    function FeatureList({ items }: { items: string[] }): VNode {
      return (
        <Ul>
          {items.map((item) => <Li>{item}</Li>)}
        </Ul>
      );
    }
    expect(render(<FeatureList items={['alpha', 'beta', 'gamma']} />)).toBe(
      '- alpha\n- beta\n- gamma\n\n'
    );
  });

  test('component wraps children in additional JSX structure', () => {
    function Callout({ children }: { children?: VNode }): VNode {
      return (
        <>
          <H3>Note</H3>
          <P>{children}</P>
        </>
      );
    }
    expect(render(<Callout>read carefully</Callout>)).toBe('### Note\n\nread carefully\n\n');
  });

  test('component renders nothing when given empty data', () => {
    function MaybeList({ items }: { items: string[] }): VNode {
      if (items.length === 0) return null;
      return (
        <Ul>
          {items.map((item) => <Li>{item}</Li>)}
        </Ul>
      );
    }
    expect(render(<MaybeList items={[]} />)).toBe('');
    expect(render(<MaybeList items={['x']} />)).toBe('- x\n\n');
  });
});

// ---------------------------------------------------------------------------
// Context through JSX-returning components
// Context must propagate correctly when components return JSX rather than
// strings — verifies the fix does not break the context stack.
// ---------------------------------------------------------------------------

describe('context through JSX-returning components', () => {
  test('context value is readable inside a component that returns Fragment', () => {
    const LangCtx = createContext('en');

    function LangLabel(): string {
      return useContext(LangCtx);
    }
    function Block(): VNode {
      return (
        <>
          <H2>Language</H2>
          <P><LangLabel /></P>
        </>
      );
    }

    const result = withContext(LangCtx, 'fr', () => render(<Block />));
    expect(result).toBe('## Language\n\nfr\n\n');
  });

  test('context set by outer component is visible in nested JSX-returning components', () => {
    const ThemeCtx = createContext('light');

    function ThemedContent(): VNode {
      const theme = useContext(ThemeCtx);
      return <P>{theme} mode</P>;
    }
    function Page(): VNode {
      return (
        <>
          <H1>Page</H1>
          <ThemedContent />
        </>
      );
    }

    const light = render(<Page />);
    expect(light).toBe('# Page\n\nlight mode\n\n');

    const dark = withContext(ThemeCtx, 'dark', () => render(<Page />));
    expect(dark).toBe('# Page\n\ndark mode\n\n');
  });

  test('DepthContext propagates through custom components containing Ul', () => {
    // Custom component returns a Ul/Li tree. DepthContext must still increment
    // correctly inside the returned VNode, not get confused by the extra
    // function-component layer.
    function BulletGroup(): VNode {
      return (
        <Ul>
          <Li>one</Li>
          <Li>two</Li>
        </Ul>
      );
    }
    expect(render(<BulletGroup />)).toBe('- one\n- two\n\n');
  });

   test('DepthContext nesting works when inner Ul is inside a custom component inside outer Ul', () => {
    function SubList(): VNode {
      return (
        <Ul>
          <Li>sub-a</Li>
          <Li>sub-b</Li>
        </Ul>
      );
    }
    const result = render(
      <Ul>
        <Li>top</Li>
        <SubList />
      </Ul>
    );
    // SubList's Ul is at depth > 0, so it emits a leading \n (sublist on its own line).
    // Sub items are indented one level (depth 2 → '  ').
    expect(result).toBe('- top\n\n  - sub-a\n  - sub-b\n\n');
  });
});

// ---------------------------------------------------------------------------
// Rich real-world document patterns
// Full document assembly from section components, mirroring the agent-prompt
// pattern described in the bug report.
// ---------------------------------------------------------------------------

describe('real-world document patterns', () => {
  test('section components assembled into a document', () => {
    function Overview(): VNode {
      return (
        <>
          <H2>Overview</H2>
          <P>This agent manages tasks.</P>
        </>
      );
    }
    function Rules(): VNode {
      return (
        <>
          <H2>Rules</H2>
          <Ul>
            <Li>be concise</Li>
            <Li>use examples</Li>
          </Ul>
        </>
      );
    }
    function Doc(): VNode {
      return (
        <>
          <H1>Agent</H1>
          <Overview />
          <Hr />
          <Rules />
        </>
      );
    }

    expect(render(<Doc />)).toBe(
      '# Agent\n\n' +
      '## Overview\n\n' +
      'This agent manages tasks.\n\n' +
      '---\n\n' +
      '## Rules\n\n' +
      '- be concise\n' +
      '- use examples\n\n'
    );
  });

  test('trait-section pattern: multiple sibling section components (the regression case)', () => {
    // This is the exact pattern that produced [object Object] before the fix.
    function ThinkerTraits(): VNode {
      return (
        <>
          <H3>Thinker</H3>
          <Ul>
            <Li>analytical</Li>
            <Li>methodical</Li>
          </Ul>
        </>
      );
    }
    function ExecutorTraits(): VNode {
      return (
        <>
          <H3>Executor</H3>
          <Ul>
            <Li>decisive</Li>
            <Li>action-oriented</Li>
          </Ul>
        </>
      );
    }
    function AgentProfile(): VNode {
      return (
        <>
          <H2>Agent Traits</H2>
          <ThinkerTraits />
          <ExecutorTraits />
        </>
      );
    }

    expect(render(<AgentProfile />)).toBe(
      '## Agent Traits\n\n' +
      '### Thinker\n\n' +
      '- analytical\n' +
      '- methodical\n\n' +
      '### Executor\n\n' +
      '- decisive\n' +
      '- action-oriented\n\n'
    );
  });

  test('section with table composed inside a document component', () => {
    function SchemaTable(): VNode {
      return (
        <Table>
          <Tr><Th>Field</Th><Th>Type</Th></Tr>
          <Tr><Td>id</Td><Td><Code>string</Code></Td></Tr>
          <Tr><Td>name</Td><Td><Code>string</Code></Td></Tr>
        </Table>
      );
    }
    function SchemaSection(): VNode {
      return (
        <>
          <H2>Schema</H2>
          <SchemaTable />
        </>
      );
    }

    expect(render(<SchemaSection />)).toBe(
      '## Schema\n\n' +
      '| Field | Type |\n' +
      '| --- | --- |\n' +
      '| id | `string` |\n' +
      '| name | `string` |\n\n'
    );
  });

  test('section with Callout and Codeblock', () => {
    function ExampleSection(): VNode {
      return (
        <>
          <H2>Example</H2>
          <Callout type="note">Run this first.</Callout>
          <Codeblock lang="ts">{'const x = 1;'}</Codeblock>
        </>
      );
    }

    expect(render(<ExampleSection />)).toBe(
      '## Example\n\n' +
      '> [!NOTE]\n' +
      '> Run this first.\n\n' +
      '```ts\nconst x = 1;\n```\n\n'
    );
  });

  test('Details component wrapping a composed section', () => {
    function Instructions(): VNode {
      return (
        <>
          <P>Step one.</P>
          <P>Step two.</P>
        </>
      );
    }

    expect(render(
      <Details summary="How to use">
        <Instructions />
      </Details>
    )).toBe(
      '<details>\n' +
      '<summary>How to use</summary>\n\n' +
      'Step one.\n\n' +
      'Step two.\n\n' +
      '</details>\n'
    );
  });

  test('HtmlComment wrapping a composed section', () => {
    function Meta(): VNode {
      return (
        <>
          <P>generated by theseus</P>
          <P>do not edit</P>
        </>
      );
    }

    expect(render(<HtmlComment><Meta /></HtmlComment>)).toBe(
      '<!--\ngenerated by theseus\n\ndo not edit\n-->\n'
    );
  });

  test('deeply nested component composition produces correct flat output', () => {
    function Leaf({ label }: { label: string }): VNode {
      return <Li>{label}</Li>;
    }
    function Section({ title, items }: { title: string; items: string[] }): VNode {
      return (
        <>
          <H3>{title}</H3>
          <Ul>
            {items.map((item) => <Leaf label={item} />)}
          </Ul>
        </>
      );
    }
    function Document(): VNode {
      return (
        <>
          <H1>Guide</H1>
          <Section title="Setup" items={['install', 'configure']} />
          <Section title="Usage" items={['run', 'test']} />
        </>
      );
    }

    expect(render(<Document />)).toBe(
      '# Guide\n\n' +
      '### Setup\n\n' +
      '- install\n' +
      '- configure\n\n' +
      '### Usage\n\n' +
      '- run\n' +
      '- test\n\n'
    );
  });
});
