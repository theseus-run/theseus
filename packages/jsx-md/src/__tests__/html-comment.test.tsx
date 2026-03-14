/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { HtmlComment, P } from '../index.ts';

describe('HtmlComment', () => {
  test('no children renders <!-- -->', () => {
    expect(render(<HtmlComment />)).toBe('<!-- -->\n');
  });

  test('single-line content renders inline', () => {
    expect(render(<HtmlComment>this is a comment</HtmlComment>)).toBe('<!-- this is a comment -->\n');
  });

  test('multi-line string content renders block form', () => {
    expect(render(<HtmlComment>{'line one\nline two'}</HtmlComment>)).toBe('<!--\nline one\nline two\n-->\n');
  });

  test('block children that render to multiple lines', () => {
    expect(render(
      <HtmlComment>
        <P>first paragraph</P>
        <P>second paragraph</P>
      </HtmlComment>
    )).toBe('<!--\nfirst paragraph\n\nsecond paragraph\n-->\n');
  });

  test('double-dash in content is not escaped — known behavior', () => {
    // Double-dash inside HTML comments is technically invalid HTML but we
    // do not escape it; callers are responsible for valid comment content.
    expect(render(<HtmlComment>{'some -- comment'}</HtmlComment>)).toBe('<!-- some -- comment -->\n');
  });

  test('whitespace-only string renders as <!-- --> — same as no children', () => {
    // trimEnd on '   ' = '' → inner.trim() is falsy → empty comment form
    expect(render(<HtmlComment>{'   '}</HtmlComment>)).toBe('<!-- -->\n');
  });
});
