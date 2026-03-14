# `@theseus.run/jsx-md`

Built to manage agent instructions across multiple harnesses — [Copilot](https://github.com/features/copilot), [OpenCode](https://opencode.ai), and others. The content wasn't the problem. The management was.

Agent instruction files grow. They develop conditional sections — capabilities that only apply to one harness, traits you're toggling between first-person and third-person to test what produces better behavior. A shared fragment between two agents becomes a copy-paste. A conditional becomes a ternary inside a template literal:

```typescript
const instructions = `
You are a code reviewer.

${harness === 'opencode' ? '<!-- use task() for subtasks -->' : ''}

## Traits
${firstPerson
  ? '- I always verify output before claiming done.'
  : '- The agent must verify output before claiming done.'}
`
```

No syntax highlighting for the Markdown inside the string. No types on the structure. A variant is a new file. Refactoring is grep-and-pray.

Nested lists make it worse. Markdown requires exact indentation — two spaces per level. Template strings force you to hardcode that spacing:

```typescript
const instructions = `
## Rules

- Outer rule
  - Nested rule: two hardcoded spaces
    - Deeper: four hardcoded spaces
${condition ? '  - Conditional nested item' : ''}
`
```

A false conditional leaves a blank bullet. The indentation is load-bearing and invisible. `DepthContext` in `@theseus.run/jsx-md` tracks nesting depth automatically — you write `<Ul>` inside `<Li>` and the renderer handles the spaces.

This isn't an edge case. [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — 39.8k stars, serious harness work — stores instructions the same way:

```typescript
export const PROMETHEUS_HIGH_ACCURACY_MODE = `# PHASE 3: PLAN GENERATION
## High Accuracy Mode - MANDATORY LOOP
\`\`\`typescript
while (true) {
  const result = task(subagent_type="momus", ...)
  if (result.verdict === "OKAY") break
}
\`\`\`
...` // 62 more lines of escaped template string
```

The escaped backticks are the tell — not a bad solution, it's the only solution the format offers. No composability, no reuse, no tooling support.

The web dev world solved "structured text with conditionals and composable fragments" ten years ago. JSX is a transform spec, not a React dependency — `jsxImportSource` lets you point it at any runtime. `@theseus.run/jsx-md` is a runtime that outputs Markdown:

```tsx
const ReviewerInstructions = ({ harness, firstPerson }: Props) => (
  <>
    <P>You are a code reviewer.</P>
    {harness === 'opencode' && (
      <HtmlComment>use task() for subtasks</HtmlComment>
    )}
    <H2>Traits</H2>
    <Ul>
      <Li>
        {firstPerson
          ? 'I always verify output before claiming done.'
          : 'The agent must verify output before claiming done.'}
      </Li>
    </Ul>
  </>
)

render(<ReviewerInstructions harness="opencode" firstPerson={true} />)
```

No escaped backticks. Syntax highlighting in your editor. Conditionals are JSX expressions. Variants are props. Shared fragments are components.

`render()` returns a plain string — no virtual DOM, no hydration, no React runtime anywhere in the chain. The API surface borrows React's shapes (`createContext`, `useContext`, `Context.Provider`) because they're the right shapes for this problem — not because React is involved.

---

## Install

```bash
bun add @theseus.run/jsx-md
```

Then in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@theseus.run/jsx-md"
  }
}
```

---

## What you're getting

**Zero runtime dependencies.** The package ships TypeScript source with no third-party imports. Nothing gets added to your bundle.

**Bun-first.** Ships TypeScript source directly, no compiled output. Works transparently in Bun: install, add two tsconfig lines, write TSX. The trade-off is real: vanilla Node.js without a bundler won't run `.ts` files from `node_modules`. If your stack is Vite, tsup, or esbuild, those handle it. If you're running bare Node, compiled output is on the roadmap.

**JSX without the React runtime.** When you write `<H2>Title</H2>`, the transform calls `jsx(H2, { children: "Title" })`. `H2` is a plain function — takes props, returns a string. No virtual DOM, no reconciler, no fiber, no hydration. `render()` walks the VNode tree synchronously and concatenates. The output is deterministic: same input, same string, every time. You can test it with `expect(render(<MyPrompt />)).toBe(expected)`.

The API borrows React's shapes where they fit — `createContext`, `useContext`, `Context.Provider` — without React's runtime constraints. `useContext` has no rules-of-hooks: it reads synchronously from a stack and can be called anywhere during a render.

**TypeScript-first.** All components and their props are typed. `render()` accepts `VNode`, returns `string`. Wrong usage is a compile error, not a runtime surprise.

**String children are verbatim.** `render()` passes raw string values through without escaping. `<P>{"<b>text</b>"}</P>` outputs `<b>text</b>` — no transformation. For LLM prompts this is the right default; Markdown renderers handle the rest.

**XML-structured prompts, zero config.** Any lowercase JSX tag renders as an XML block — `<context>`, `<instructions>`, `<example index={1}>`. Anthropic's prompt engineering guide recommends this structure for Claude agents. Attributes are typed and serialized automatically; empty tags self-close. No imports, no registration — it's built into the JSX intrinsics catch-all.

---

## Usage

```tsx
// system-prompt.tsx
import { render, H2, P, Ul, Li, Bold, Code } from "@theseus.run/jsx-md";

const prompt = render(
  <>
    <H2>Role</H2>
    <P>
      You are a precise code reviewer. Your job is to find bugs, not suggest
      style changes.
    </P>

    <H2>Rules</H2>
    <Ul>
      <Li>
        Flag <Bold>P0</Bold> issues immediately — do not bury them.
      </Li>
      <Li>
        Use <Code>inline code</Code> when referencing identifiers.
      </Li>
      <Li>One finding per comment. No compound observations.</Li>
    </Ul>

    <H2>Output format</H2>
    <P>
      Respond with a structured list. Each item: severity, location, finding.
    </P>
  </>
);

console.log(prompt);
```

Output:

```markdown
## Role

You are a precise code reviewer. Your job is to find bugs, not suggest style changes.

## Rules

- Flag **P0** issues immediately — do not bury them.
- Use `inline code` when referencing identifiers.
- One finding per comment. No compound observations.

## Output format

Respond with a structured list. Each item: severity, location, finding.
```

---

## Structured agent instructions

Anthropic's prompt engineering guide recommends XML tags to structure Claude prompts — wrapping each content type in its own tag reduces misinterpretation. `<instructions>`, `<context>`, `<examples>`, `<document index="n">` are the documented patterns.

Any lowercase JSX tag is an XML intrinsic in `@theseus.run/jsx-md`. No imports, no registration:

```tsx
const ReviewerPrompt = ({ repo, examples }: Props) => (
  <>
    <context>
      <P>Repository: {repo}. Language: TypeScript. Package manager: bun.</P>
    </context>

    <instructions>
      <H2>Role</H2>
      <P>You are a precise code reviewer. Find bugs, not style issues.</P>

      <H2>Rules</H2>
      <Ul>
        <Li>Flag <Bold>P0</Bold> issues first — do not bury them.</Li>
        <Li>One finding per comment. No compound observations.</Li>
        <Li>Use <Code>inline code</Code> when referencing identifiers.</Li>
      </Ul>
    </instructions>

    {examples.length > 0 && (
      <examples>
        {examples.map((ex, i) => (
          <example index={i + 1}>
            <Md>{ex}</Md>
          </example>
        ))}
      </examples>
    )}
  </>
)
```

Output:

```
<context>
Repository: cockpit. Language: TypeScript. Package manager: bun.
</context>

<instructions>
## Role

You are a precise code reviewer. Find bugs, not style issues.

## Rules

- Flag **P0** issues first — do not bury them.
- One finding per comment. No compound observations.
- Use `inline code` when referencing identifiers.
</instructions>

<examples>
  <example index="1">
    ... your example content ...
  </example>
</examples>
```

Attributes are typed (`index={1}` → `index="1"`), boolean `true` attrs render bare, `false`/`null`/`undefined` are omitted. Empty tags self-close: `<tag />`.

---

## Context API

Prop-drilling is the natural failure mode for prompt trees with conditional sections. A component deep in the tree needs to know which harness it's rendering for, and that value ends up threaded through every component between the root and the consumer.

`createContext` / `useContext` / `Context.Provider` — same shape as React, synchronous.

```tsx
import { render, createContext, useContext, P, Ul, Li } from "@theseus.run/jsx-md";

const HarnessCtx = createContext<'opencode' | 'copilot'>('copilot');

function Instructions() {
  const harness = useContext(HarnessCtx);
  return (
    <Ul>
      <Li>Always verify output before claiming done.</Li>
      {harness === 'opencode' && <Li>Use task() for multi-step subtasks.</Li>}
    </Ul>
  );
}

// Set the value once at the root — no prop threading:
const prompt = render(
  <HarnessCtx.Provider value="opencode">
    <Instructions />
  </HarnessCtx.Provider>
);
```

`useContext` returns the default value when called outside a Provider. Providers nest correctly — innermost wins. The context stack is restored after each Provider exits, including on exceptions.

`withContext(ctx, value, fn)` is a lower-level escape hatch for non-JSX call sites. It shares the same stack as Provider — they interoperate on the same context object.

---

## Primitives

| Component | Markdown output |
|-----------|----------------|
| `H1`–`H6` | `#`–`######` headings |
| `P` | Paragraph (blank line separated) |
| `Hr` | `---` horizontal rule |
| `Codeblock` | Fenced code block with optional `lang` prop |
| `Blockquote` | `>` blockquote |
| `Ul` | Unordered list |
| `Ol` | Ordered list |
| `Li` | List item (supports nesting via `Ul`/`Ol` inside `Li`) |
| `TaskList` | Task list container |
| `Task` | `- [ ]` / `- [x]` task item (`done` prop) |
| `Table` | Markdown table |
| `Tr` | Table row |
| `Th` | Table header cell |
| `Td` | Table data cell |
| `Bold` | `**bold**` |
| `Code` | `` `inline code` `` |
| `Italic` | `*italic*` |
| `Strikethrough` | `~~strikethrough~~` |
| `Link` | `[text](url)` |
| `Img` | `![alt](src)` |
| `Md` | Raw markdown passthrough (escape hatch for complex inline combinations) |
| `HtmlComment` | `<!-- comment -->` (invisible to most renderers; useful for LLM-only instructions) |
| `Details` | `<details><summary>` collapsible block |
| `Callout` | GitHub-style admonition with `type` prop: `note`, `tip`, `important`, `warning`, `caution` |

---

## Roadmap

**v0.1.x** — current. TypeScript source, Bun-first. Markdown primitives + XML intrinsic elements + Context API (`createContext` / `useContext` / `Context.Provider`).

**v0.2.0** — planned:

- _Node.js compiled output._ Ships a compiled `dist/` alongside the TypeScript source. Unblocks bare Node.js without a bundler.

---

## License

MIT — see [LICENSE](../../LICENSE). 

Built by [Roman Dubinin](https://romanonthego.com). 

Part of [Theseus](https://theseus.run).
