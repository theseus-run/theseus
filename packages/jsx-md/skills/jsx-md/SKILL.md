---
name: jsx-md
description: Write agent instructions, SKILL.md files, and LLM prompts as typed JSX/TSX components using @theseus.run/jsx-md. Use when creating or editing .tsx files that render Markdown strings via render(), authoring jsx-md components, or working with the jsx-md primitives, Context API, or XML intrinsics.
---

# @theseus.run/jsx-md

JSX runtime that outputs Markdown strings. No React, no virtual DOM. `render()` is synchronous and returns a plain string. Same input → same string every time.

## Setup

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@theseus.run/jsx-md"
  }
}
```

Import:

```ts
import { render, H1, H2, P, Ul, Li, Bold, Code } from "@theseus.run/jsx-md"
```

## Authoring rules

**1. Prefer components over inline markdown syntax.**

```tsx
// WRONG
<P>**bold** and `code`</P>

// CORRECT
<P><Bold>bold</Bold> and <Code>code</Code></P>
```

**2. Bare JSX text for plain prose. `{'...'}` only when the string contains a character JSX cannot represent as bare text.**

Characters requiring `{'...'}`: `` ` `` `{` `}` `<` `>` `'`

Characters safe as bare text: letters, spaces, digits, `. , : ; ! ? — – - ( ) [ ] " & * + = | / \`

```tsx
// WRONG — unnecessary wrapper
<Li><Bold>P1</Bold>{': Guard clauses over nesting.'}</Li>

// CORRECT — bare text
<Li><Bold>P1</Bold>: Guard clauses over nesting.</Li>

// CORRECT — must wrap, contains single quote
<Li><Bold>P1</Bold>{": Dead code: delete, don't comment out."}</Li>

// CORRECT — must wrap, contains backtick
<P>{'Format: `ROI≈X.X`'}</P>
```

**3. `Md` is an escape hatch only.** Legitimate use: 4+ mixed inline spans where decomposition adds noise. Never use `Md` for content that decomposes cleanly into components.

```tsx
// Legitimate — 6 code spans mixed with bold
<Li><Md>{'**P0**: Type = `TKey`. Not `TFuncKey`, `string`, or `<Trans>`.'}</Md></Li>

// Not legitimate — decompose instead
<Li><Md>{'**P1**: Guard clauses over nesting.'}</Md></Li>
// → <Li><Bold>P1</Bold>: Guard clauses over nesting.</Li>
```

## Primitives

Full table with output shapes: [references/primitives.md](references/primitives.md).

| Category | Components |
|---|---|
| Block | `H1`–`H6`, `P`, `Hr`, `Codeblock`, `Blockquote` |
| List | `Ul`, `Ol`, `Li`, `TaskList`, `Task` |
| Table | `Table`, `Tr`, `Th`, `Td` |
| Inline | `Bold`, `Code`, `Italic`, `Strikethrough`, `Br`, `Sup`, `Sub`, `Kbd`, `Link`, `Img` |
| Escape | `Escape` (component), `escapeMarkdown` (function) |
| Raw | `Md` |
| Other | `HtmlComment`, `Details`, `Callout` |

Key props:

- `Codeblock` — `lang?: string`, `indent?: number`
- `Task` — `done?: boolean` (`- [x]` when true, `- [ ]` when false/omitted)
- `Th` — `align?: 'left' | 'center' | 'right'`
- `Callout` — `type: 'note' | 'tip' | 'important' | 'warning' | 'caution'` (required)
- `Details` — `summary: string` (required)
- `Link` — `href: string` (required)
- `Img` — `src: string`, `alt?: string`

Nesting: `Ul`/`Ol` inside `Li` is fully supported. `DepthContext` tracks depth and computes indentation automatically — never count spaces manually.

## Context API

Same shape as React — `createContext`, `useContext`, `Context.Provider`. Synchronous only. Not safe for concurrent `render()` calls in the same process.

```tsx
import { render, createContext, useContext, Ul, Li, Code } from "@theseus.run/jsx-md"

const HarnessCtx = createContext<'opencode' | 'copilot'>('copilot')

const StepsSection = () => {
  const harness = useContext(HarnessCtx)
  return (
    <Ul>
      <Li>Always verify output before claiming done.</Li>
      {harness === 'opencode' && <Li>Use <Code>task()</Code> for multi-step subtasks.</Li>}
    </Ul>
  )
}

const prompt = render(
  <HarnessCtx.Provider value="opencode">
    <StepsSection />
  </HarnessCtx.Provider>
)
```

`useContext` returns the default when called outside a Provider. Providers nest — innermost wins.

## XML intrinsics

Any lowercase JSX tag renders as an XML block. No imports, no registration. Use for Anthropic-style prompt structure (`<instructions>`, `<context>`, `<examples>`).

```tsx
const ReviewerPrompt = ({ repo, examples }: Props) => (
  <>
    <context>
      <P>Repository: {repo}. Language: TypeScript.</P>
    </context>
    <instructions>
      <H2>Role</H2>
      <P>You are a precise code reviewer.</P>
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

Attribute serialization:

- `index={1}` → `index="1"`
- `active={true}` → `active` (bare attribute)
- `active={false}` / `active={null}` / `active={undefined}` → omitted
- Empty content → self-closing: `<tag />`
- Object value → throws — use `JSON.stringify()` to convert first
