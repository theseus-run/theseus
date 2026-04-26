---
name: tool-authoring
description: Use when creating, modifying, reviewing, or debugging Theseus Tool primitives or concrete tools in packages/theseus-core/src/tool and packages/theseus-tools.
---

# Tool Authoring

Use this skill for `Tool` primitive work and concrete tools.

## Read First

- `packages/theseus-core/src/Tool.ts`
- `packages/theseus-core/src/tool/index.ts`
- `packages/theseus-core/src/tool/run.ts`
- For concrete tools: the relevant file in `packages/theseus-tools/src/`

## Contract

A tool is typed world access for the model. It declares input, output, known failure, execution, presentation, and interaction policy.

Preserve this pipeline:

1. Decode raw model args with `tool.input`.
2. Run `tool.execute`, applying `tool.retry` if present.
3. Validate success output with `tool.output`.
4. Validate known failure with `tool.failure`.
5. Present success or known failure as `Presentation`.
6. Convert defects into `ToolDefect`.

Known failures are tool-result content for the model, not runtime exceptions. Runtime errors are decode, output-shape, failure-shape, and defect errors.

## Authoring Rules

- Use `Tool.defineTool`; do not create ad hoc tool objects unless testing a boundary directly.
- Use Effect Schema for `input`, `output`, and `failure`.
- Use `Tool.Defaults.NoFailure` only when the tool has no declared domain failure.
- Keep tool names stable and LLM-callable.
- Keep descriptions operational: what the tool does, not implementation trivia.
- Set `policy.interaction` intentionally. Do not default write-like behavior to observe/read semantics.
- If a tool touches the filesystem, shell, network, or process state, model that risk in policy and failure shape.
- Prefer small concrete tools over a generic "do anything" tool.

## Verification

- Run the package-local test when changing `packages/theseus-tools`: `bun test src/` from that package or root `bun run test` when impact crosses packages.
- Run root `bun run typecheck` when signatures, schemas, exports, or Effect environments change.
