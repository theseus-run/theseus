---
name: jsx-md-authoring
description: Use when writing or modifying JSX-MD prompt components, Markdown-rendering primitives, XML intrinsic prompts, or packages/jsx-md and packages/jsx-md-beautiful-mermaid behavior.
---

# JSX-MD Authoring

Use this skill for prompt components and Markdown rendering code.

## Read First

- `packages/jsx-md/README.md`
- `packages/jsx-md/src/primitives.tsx`
- `packages/jsx-md/src/render.ts`
- `packages/jsx-md/src/context.ts`

## Authoring Rules

- Prefer JSX-MD components over inline Markdown strings.
- Use lowercase XML intrinsics for structured LLM prompt sections such as `<context>`, `<instructions>`, and `<examples>`.
- Use `Md` only as an escape hatch for genuinely undecomposable Markdown.
- Escape user-supplied strings with `Escape` or `escapeMarkdown` when they should render literally.
- Use `Codeblock` for fenced code and let it choose a safe fence length.
- Keep `render()` deterministic and synchronous.
- Do not introduce React or DOM runtime assumptions into `jsx-md`.
- Use context only for cross-cutting rendering state, not arbitrary global state.

## Text Rules

- Bare JSX text is preferred for plain prose.
- Use `{...}` only when JSX syntax requires it, such as backticks, braces, `<`, `>`, or apostrophes inside the text.
- Keep XML attributes primitive and serializable.

## Verification

- Run `bun test` in `packages/jsx-md` for renderer changes.
- Run `bun run typecheck` after export, type, or JSX runtime changes.
