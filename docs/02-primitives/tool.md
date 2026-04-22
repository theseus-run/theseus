# Tool

> Status: draft
> Last updated: 2026-04-18

This note is the canonical design note for the `Tool` primitive.

## Role

`Tool` is the boundary between model reasoning and world interaction.

## Current decisions

- Effect-first: tool execution returns `Effect`
- Schema-first boundary: input, success, and failure are explicit
- Policy is a single ordered field: `policy.interaction`
- `interaction` levels are `pure`, `observe`, `write_idempotent`, `write`, `write_destructive`
- `description` is the model-facing behavioral contract
- Parameter semantics belong on schema field descriptions, not in the top-level description
- Tools are plain data, not classes or services

## Companion notes

- [[tools]] for the example tool set
- [[tool-composition]] for toolkit assembly
- [[tool-backends]] for implementation choices
- [[primitives]] for the larger primitive stack

## Open questions

- Should presentation stay on the primitive or move to a higher adapter layer?
- Should retry policy live on the tool or entirely in the runtime?
