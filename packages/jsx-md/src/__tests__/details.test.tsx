/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { Details, P, H2, Ul, Li } from '../index.ts';

describe('Details', () => {
  test('summary + single paragraph body', () => {
    expect(render(
      <Details summary="Click to expand">
        <P>This is the body content.</P>
      </Details>
    )).toBe(
      '<details>\n' +
      '<summary>Click to expand</summary>\n\n' +
      'This is the body content.\n\n' +
      '</details>\n'
    );
  });

  test('summary + rich body (H2 + Ul)', () => {
    expect(render(
      <Details summary="Implementation notes">
        <H2>Steps</H2>
        <Ul>
          <Li>read the spec</Li>
          <Li>write the code</Li>
          <Li>run the tests</Li>
        </Ul>
      </Details>
    )).toBe(
      '<details>\n' +
      '<summary>Implementation notes</summary>\n\n' +
      '## Steps\n\n' +
      '- read the spec\n' +
      '- write the code\n' +
      '- run the tests\n\n' +
      '</details>\n'
    );
  });

  test('blank line after </summary> is required for GitHub markdown rendering', () => {
    const result = render(
      <Details summary="See more"><P>body</P></Details>
    );
    expect(result).toContain('</summary>\n\n');
  });

  test('summary with special HTML characters is escaped', () => {
    expect(render(
      <Details summary="A & B <note>">
        <P>body</P>
      </Details>
    )).toBe(
      '<details>\n' +
      '<summary>A &amp; B &lt;note&gt;</summary>\n\n' +
      'body\n\n' +
      '</details>\n'
    );
  });

  test('summary with double-quote is not escaped — escapeHtmlContent leaves " literal', () => {
    expect(render(
      <Details summary={'say "hello"'}>
        <P>body</P>
      </Details>
    )).toBe(
      '<details>\n' +
      '<summary>say "hello"</summary>\n\n' +
      'body\n\n' +
      '</details>\n'
    );
  });

  test('empty body — double blank line before </details>', () => {
    // trimEnd on '' = '' → body is ''; the template produces \n\n + '' + \n\n before </details>
    expect(render(
      <Details summary="title"></Details>
    )).toBe(
      '<details>\n' +
      '<summary>title</summary>\n\n' +
      '\n\n' +
      '</details>\n'
    );
  });

  test('nested Details — inner collapsible inside outer collapsible', () => {
    expect(render(
      <Details summary="outer">
        <P>outer body</P>
        <Details summary="inner">
          <Ul>
            <Li>item one</Li>
            <Li>item two</Li>
          </Ul>
        </Details>
      </Details>
    )).toBe(
      '<details>\n' +
      '<summary>outer</summary>\n\n' +
      'outer body\n\n' +
      '<details>\n' +
      '<summary>inner</summary>\n\n' +
      '- item one\n' +
      '- item two\n\n' +
      '</details>\n\n' +
      '</details>\n'
    );
  });

  test('summary with newline is collapsed to space', () => {
    expect(render(
      <Details summary={'first line\nsecond line'}>
        <P>body</P>
      </Details>
    )).toBe(
      '<details>\n' +
      '<summary>first line second line</summary>\n\n' +
      'body\n\n' +
      '</details>\n'
    );
  });
});
