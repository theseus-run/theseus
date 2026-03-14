/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { Callout, P, Ul, Li, Blockquote } from '../index.ts';

describe('Callout', () => {
  test('type note', () => {
    expect(render(<Callout type="note">content</Callout>)).toBe('> [!NOTE]\n> content\n\n');
  });

  test('type tip', () => {
    expect(render(<Callout type="tip">content</Callout>)).toBe('> [!TIP]\n> content\n\n');
  });

  test('type important', () => {
    expect(render(<Callout type="important">content</Callout>)).toBe('> [!IMPORTANT]\n> content\n\n');
  });

  test('type warning', () => {
    expect(render(<Callout type="warning">content</Callout>)).toBe('> [!WARNING]\n> content\n\n');
  });

  test('type caution', () => {
    expect(render(<Callout type="caution">content</Callout>)).toBe('> [!CAUTION]\n> content\n\n');
  });

  test('multiline children — empty lines become bare >', () => {
    expect(render(
      <Callout type="important">
        <P>Read this carefully.</P>
        <Ul>
          <Li>step one</Li>
          <Li>step two</Li>
        </Ul>
      </Callout>
    )).toBe(
      '> [!IMPORTANT]\n' +
      '> Read this carefully.\n' +
      '>\n' +
      '> - step one\n' +
      '> - step two\n\n'
    );
  });

  test('followed by P — blank line separator between blocks', () => {
    expect(render(
      <>
        <Callout type="note">heads up</Callout>
        <P>after the callout</P>
      </>
    )).toBe('> [!NOTE]\n> heads up\n\nafter the callout\n\n');
  });

  test('empty children — bare > line after header', () => {
    // trimEnd on '' = '', split gives [''], empty line maps to '>'
    expect(render(<Callout type="note"></Callout>)).toBe('> [!NOTE]\n>\n\n');
  });

  test('Callout inside Blockquote — produces double > > prefix', () => {
    expect(render(
      <Blockquote>
        <Callout type="warning">watch out</Callout>
      </Blockquote>
    )).toBe('> > [!WARNING]\n> > watch out\n\n');
  });
});
