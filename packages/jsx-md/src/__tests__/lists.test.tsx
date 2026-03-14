/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { Ul, Ol, Li, Bold, Code, TaskList, Task, P, Callout } from '../index.ts';

// ---------------------------------------------------------------------------
// Ul — flat
// ---------------------------------------------------------------------------

describe('Ul flat', () => {
  test('single item', () => {
    expect(render(<Ul><Li>only</Li></Ul>)).toBe('- only\n\n');
  });

  test('multiple items', () => {
    expect(render(
      <Ul>
        <Li>alpha</Li>
        <Li>beta</Li>
        <Li>gamma</Li>
      </Ul>
    )).toBe('- alpha\n- beta\n- gamma\n\n');
  });

  test('Li with inline formatting', () => {
    expect(render(
      <Ul>
        <Li><Bold>important</Bold>: do this</Li>
        <Li><Code>fn()</Code> — calls the function</Li>
      </Ul>
    )).toBe('- **important**: do this\n- `fn()` — calls the function\n\n');
  });

  test('empty Ul at depth 0 renders just a trailing newline', () => {
    expect(render(<Ul></Ul>)).toBe('\n');
  });
});

// ---------------------------------------------------------------------------
// Ol — flat
// ---------------------------------------------------------------------------

describe('Ol flat', () => {
  test('auto-numbers items from 1', () => {
    expect(render(
      <Ol>
        <Li>first step</Li>
        <Li>second step</Li>
        <Li>third step</Li>
      </Ol>
    )).toBe('1. first step\n2. second step\n3. third step\n\n');
  });

  test('single item starts at 1', () => {
    expect(render(<Ol><Li>only step</Li></Ol>)).toBe('1. only step\n\n');
  });

  test('empty Ol at depth 0 renders just a trailing newline', () => {
    expect(render(<Ol></Ol>)).toBe('\n');
  });
});

// ---------------------------------------------------------------------------
// Li outside a list container
// ---------------------------------------------------------------------------

describe('Li outside list', () => {
  test('depth=0 — renders without indent, no crash', () => {
    expect(render(<Li>standalone item</Li>)).toBe('- standalone item\n');
  });

  test('whitespace-only content — trimEnd produces empty label', () => {
    expect(render(<Li>{'   '}</Li>)).toBe('- \n');
  });

  test('block element (P) inside Li — trimEnd strips trailing newlines', () => {
    // P renders 'text\n\n'; trimEnd inside Li strips it to 'text'
    expect(render(<Li><P>text</P></Li>)).toBe('- text\n');
  });
});

// ---------------------------------------------------------------------------
// Nested lists
// ---------------------------------------------------------------------------

describe('nested lists', () => {
  test('Ul one level deep', () => {
    expect(render(
      <Ul>
        <Li>top</Li>
        <Ul>
          <Li>sub</Li>
        </Ul>
      </Ul>
    )).toBe('- top\n  - sub\n\n');
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
    )).toBe('- top\n  - mid\n    - deep\n\n');
  });

  test('Ol with nested Ul — known limitation: first sub-item appears inline', () => {
    // Li trims its inner content; the first child of the nested Ul appears
    // on the same line as the parent Li text. This is a known structural
    // limitation — fixing it would require block-aware rendering.
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
    )).toBe('1. first\n2. second  - sub-a\n  - sub-b\n\n');
  });
});

// ---------------------------------------------------------------------------
// Ol constraints — must be at depth 0
// ---------------------------------------------------------------------------

describe('Ol constraints', () => {
  test('Ol nested directly inside Ol throws', () => {
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

  test('Ol nested directly inside Ul throws', () => {
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

  test('Ol inside Li inside Ul throws — depth is already > 0', () => {
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
// TaskList + Task
// ---------------------------------------------------------------------------

describe('TaskList + Task', () => {
  test('single unchecked item', () => {
    expect(render(
      <TaskList><Task>buy milk</Task></TaskList>
    )).toBe('- [ ] buy milk\n\n');
  });

  test('single checked item (done prop)', () => {
    expect(render(
      <TaskList><Task done>buy milk</Task></TaskList>
    )).toBe('- [x] buy milk\n\n');
  });

  test('done={false} explicit — same as omitting done', () => {
    expect(render(
      <TaskList><Task done={false}>buy milk</Task></TaskList>
    )).toBe('- [ ] buy milk\n\n');
  });

  test('multiple items mixed checked/unchecked', () => {
    expect(render(
      <TaskList>
        <Task done>write tests</Task>
        <Task>update docs</Task>
        <Task done>fix bug</Task>
        <Task>deploy</Task>
      </TaskList>
    )).toBe('- [x] write tests\n- [ ] update docs\n- [x] fix bug\n- [ ] deploy\n\n');
  });

  test('Task with inline formatting children', () => {
    expect(render(
      <TaskList>
        <Task done><Bold>implement</Bold> the feature</Task>
        <Task>write <Code>README.md</Code></Task>
      </TaskList>
    )).toBe('- [x] **implement** the feature\n- [ ] write `README.md`\n\n');
  });

  test('nested TaskList — known limitation: first inner item appears inline', () => {
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
    )).toBe('- [x] outer done\n- [ ] outer unchecked  - [x] inner done\n  - [ ] inner unchecked\n\n');
  });

  test('Task outside TaskList (depth=0) — no crash, no negative indent', () => {
    expect(render(<Task>standalone</Task>)).toBe('- [ ] standalone\n');
  });

  test('TaskList inside Callout', () => {
    expect(render(
      <Callout type="tip">
        <TaskList>
          <Task done>step one</Task>
          <Task>step two</Task>
        </TaskList>
      </Callout>
    )).toBe('> [!TIP]\n> - [x] step one\n> - [ ] step two\n\n');
  });
});
