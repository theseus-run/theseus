/**
 * Integration smoke test for the compiled dist/ output.
 *
 * Run with Node.js:  node test/dist.mjs
 * Run with Bun:      bun test/dist.mjs
 *
 * No test framework — uses node:assert/strict so it works in both runtimes
 * without any build step. VNodes are constructed with the jsx() factory
 * directly, mirroring what a TSX compiler emits.
 *
 * Coverage: every export category (render, escapeMarkdown, jsx factory,
 * Fragment, block, inline, list, table alignment, new components, context).
 */

import assert from 'node:assert/strict';

import {
  render,
  escapeMarkdown,
  createContext,
  useContext,
  withContext,
  H1, H2, P, Hr, Blockquote,
  Ul, Ol, Li,
  Table, Tr, Th, Td,
  Bold, Code, Italic, Strikethrough, Link, Img,
  Br, Sup, Sub, Kbd, Escape,
  Md,
  TaskList, Task,
  Callout,
  HtmlComment,
  Details,
} from '../dist/index.js';

import { jsx, jsxs, Fragment } from '../dist/jsx-runtime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${label}`);
    console.error(`        ${err.message}`);
  }
}

function eq(actual, expected) {
  assert.equal(actual, expected);
}

// ---------------------------------------------------------------------------
// render() — primitives
// ---------------------------------------------------------------------------

test('render null → empty string', () => eq(render(null), ''));
test('render undefined → empty string', () => eq(render(undefined), ''));
test('render false → empty string', () => eq(render(false), ''));
test('render true → empty string', () => eq(render(true), ''));
test('render string → string', () => eq(render('hello'), 'hello'));
test('render number → string', () => eq(render(42), '42'));
test('render array → concatenated', () => eq(render(['a', 'b', 'c']), 'abc'));

// ---------------------------------------------------------------------------
// jsx factory + Fragment
// ---------------------------------------------------------------------------

test('jsx factory returns VNode object', () => {
  const node = jsx(P, { children: 'text' });
  assert.equal(typeof node, 'object');
  assert.equal(node.type, P);
});

test('jsxs is same function as jsx', () => {
  assert.equal(jsx, jsxs);
});

test('Fragment renders children directly', () => {
  const node = jsx(Fragment, { children: ['a', 'b'] });
  eq(render(node), 'ab');
});

// ---------------------------------------------------------------------------
// Block components
// ---------------------------------------------------------------------------

test('H1', () => eq(render(jsx(H1, { children: 'Title' })), '# Title\n\n'));
test('H2', () => eq(render(jsx(H2, { children: 'Sub' })), '## Sub\n\n'));
test('P', () => eq(render(jsx(P, { children: 'text' })), 'text\n\n'));
test('Hr', () => eq(render(jsx(Hr, {})), '---\n\n'));
test('Blockquote', () => eq(render(jsx(Blockquote, { children: 'quote' })), '> quote\n\n'));

// ---------------------------------------------------------------------------
// Inline components
// ---------------------------------------------------------------------------

test('Bold', () => eq(render(jsx(Bold, { children: 'strong' })), '**strong**'));
test('Italic', () => eq(render(jsx(Italic, { children: 'em' })), '*em*'));
test('Code', () => eq(render(jsx(Code, { children: 'fn()' })), '`fn()`'));
test('Strikethrough', () => eq(render(jsx(Strikethrough, { children: 'old' })), '~~old~~'));
test('Link', () => eq(render(jsx(Link, { href: 'https://example.com', children: 'click' })), '[click](https://example.com)'));
test('Img', () => eq(render(jsx(Img, { src: 'img.png', alt: 'fig' })), '![fig](img.png)'));

// ---------------------------------------------------------------------------
// New inline components (Br, Sup, Sub, Kbd, Escape)
// ---------------------------------------------------------------------------

test('Br → two trailing spaces + newline', () => eq(render(jsx(Br, {})), '  \n'));
test('Sup', () => eq(render(jsx(Sup, { children: '2' })), '<sup>2</sup>'));
test('Sub', () => eq(render(jsx(Sub, { children: 'i' })), '<sub>i</sub>'));
test('Kbd', () => eq(render(jsx(Kbd, { children: 'Enter' })), '<kbd>Enter</kbd>'));
test('Escape — metacharacters escaped', () => eq(render(jsx(Escape, { children: '**bold**' })), '\\*\\*bold\\*\\*'));
test('Escape — plain text unchanged', () => eq(render(jsx(Escape, { children: 'hello' })), 'hello'));

// ---------------------------------------------------------------------------
// escapeMarkdown function
// ---------------------------------------------------------------------------

test('escapeMarkdown — **bold**', () => eq(escapeMarkdown('**bold**'), '\\*\\*bold\\*\\*'));
test('escapeMarkdown — plain text', () => eq(escapeMarkdown('hello world'), 'hello world'));
test('escapeMarkdown — & not escaped', () => eq(escapeMarkdown('a & b'), 'a & b'));

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

test('Ul + Li', () => {
  const node = jsx(Ul, {
    children: jsxs(Fragment, {
      children: [
        jsx(Li, { children: 'one' }),
        jsx(Li, { children: 'two' }),
      ],
    }),
  });
  eq(render(node), '- one\n- two\n\n');
});

test('Ol + Li (numbered)', () => {
  const node = jsx(Ol, {
    children: jsxs(Fragment, {
      children: [
        jsx(Li, { children: 'first' }),
        jsx(Li, { children: 'second' }),
      ],
    }),
  });
  eq(render(node), '1. first\n2. second\n\n');
});

// ---------------------------------------------------------------------------
// Table with column alignment
// ---------------------------------------------------------------------------

test('Table — default alignment', () => {
  const node = jsx(Table, {
    children: jsxs(Fragment, {
      children: [
        jsx(Tr, { children: jsxs(Fragment, { children: [jsx(Th, { children: 'Name' }), jsx(Th, { children: 'Val' })] }) }),
        jsx(Tr, { children: jsxs(Fragment, { children: [jsx(Td, { children: 'a' }), jsx(Td, { children: 'b' })] }) }),
      ],
    }),
  });
  eq(render(node), '| Name | Val |\n| --- | --- |\n| a | b |\n\n');
});

test('Table — left/center/right alignment', () => {
  const node = jsx(Table, {
    children: jsx(Tr, {
      children: jsxs(Fragment, {
        children: [
          jsx(Th, { align: 'left', children: 'L' }),
          jsx(Th, { align: 'center', children: 'C' }),
          jsx(Th, { align: 'right', children: 'R' }),
        ],
      }),
    }),
  });
  eq(render(node), '| L | C | R |\n| :--- | :---: | ---: |\n\n');
});

// ---------------------------------------------------------------------------
// TaskList / Task
// ---------------------------------------------------------------------------

test('TaskList + Task', () => {
  const node = jsx(TaskList, {
    children: jsxs(Fragment, {
      children: [
        jsx(Task, { children: 'todo' }),
        jsx(Task, { done: true, children: 'done' }),
      ],
    }),
  });
  eq(render(node), '- [ ] todo\n- [x] done\n\n');
});

// ---------------------------------------------------------------------------
// Callout / HtmlComment / Details
// ---------------------------------------------------------------------------

test('Callout', () => {
  const node = jsx(Callout, { type: 'note', children: 'heads up' });
  eq(render(node), '> [!NOTE]\n> heads up\n\n');
});

test('HtmlComment', () => {
  const node = jsx(HtmlComment, { children: 'internal note' });
  eq(render(node), '<!-- internal note -->\n');
});

test('Details', () => {
  const node = jsx(Details, { summary: 'click me', children: 'body' });
  eq(render(node), '<details>\n<summary>click me</summary>\n\nbody\n\n</details>\n');
});

// ---------------------------------------------------------------------------
// Context API (module-level singleton must survive bundling)
// ---------------------------------------------------------------------------

test('createContext + useContext default', () => {
  const Ctx = createContext('default');
  eq(useContext(Ctx), 'default');
});

test('withContext overrides value', () => {
  const Ctx = createContext('default');
  const result = withContext(Ctx, 'overridden', () => useContext(Ctx));
  eq(result, 'overridden');
});

test('Context.Provider in render tree', () => {
  const Ctx = createContext('x');
  function Reader() { return useContext(Ctx); }
  const node = jsx(Ctx.Provider, {
    value: 'y',
    children: jsx(Reader, {}),
  });
  eq(render(node), 'y');
});

test('Nested providers — innermost wins', () => {
  const Ctx = createContext('a');
  function Reader() { return useContext(Ctx); }
  const node = jsx(Ctx.Provider, {
    value: 'outer',
    children: jsx(Ctx.Provider, {
      value: 'inner',
      children: jsx(Reader, {}),
    }),
  });
  eq(render(node), 'inner');
});

// ---------------------------------------------------------------------------
// Md passthrough
// ---------------------------------------------------------------------------

test('Md passes raw string through', () => {
  eq(render(jsx(Md, { children: '**raw**' })), '**raw**');
});

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

const runtime = typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : `Node ${process.version}`;
if (failed > 0) {
  console.error(`\n${runtime}: ${failed} failed, ${passed} passed`);
  process.exit(1);
} else {
  console.log(`${runtime}: ${passed} passed`);
}
