/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { P, Ul, Li, H2 } from '../index.ts';

// String-type tags are rendered as XML blocks: <tag attrs>\ncontent\n</tag>\n
// or self-closing <tag attrs />\n when content is empty.

describe('XML tags', () => {
  test('self-closing when no children', () => {
    expect(render(<br />)).toBe('<br />\n');
  });

  test('non-self-closing with text content', () => {
    expect(render(<task>do the thing</task>)).toBe('<task>\ndo the thing\n</task>\n');
  });

  test('non-self-closing when children are whitespace-only', () => {
    // Whitespace-only inner renders to non-empty string so tag is not self-closed.
    expect(render(<task>{'\n'}</task>)).toBe('<task>\n\n</task>\n');
  });

  test('markdown children inside XML tag', () => {
    expect(render(
      <task>
        <P>Do X.</P>
        <Ul><Li>step</Li></Ul>
      </task>
    )).toBe('<task>\nDo X.\n\n- step\n</task>\n');
  });

  test('string attributes', () => {
    expect(render(
      <task type="summary" priority="high">content</task>
    )).toBe('<task type="summary" priority="high">\ncontent\n</task>\n');
  });

  test('boolean attribute renders as bare attribute name', () => {
    expect(render(<task required>content</task>)).toBe('<task required>\ncontent\n</task>\n');
  });

  test('undefined and null attributes are omitted', () => {
    expect(render(<task type={undefined}>content</task>)).toBe('<task>\ncontent\n</task>\n');
  });

  test('false attribute is omitted', () => {
    expect(render(<task required={false}>content</task>)).toBe('<task>\ncontent\n</task>\n');
  });

  test('nested XML tags', () => {
    expect(render(
      <context>
        <task>inner</task>
      </context>
    )).toBe('<context>\n<task>\ninner\n</task>\n</context>\n');
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
    )).toBe('<instructions>\n## Rules\n\n- be concise\n- use examples\n</instructions>\n');
  });

  test('escapes " and & in attribute values', () => {
    expect(render(<task type='a"b' label="x & y" />)).toBe('<task type="a&quot;b" label="x &amp; y" />\n');
  });

  test('escapes < and > in attribute values', () => {
    expect(render(<task type="a<b>c" />)).toBe('<task type="a&lt;b&gt;c" />\n');
  });
});
