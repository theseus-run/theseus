---
status: current
owner: primitives
kind: concept
updated: 2026-04-28
---

# Tool Composition — Design Decisions

> Status: locked design, not yet implemented
> Last updated: 2026-04-03

## Tools are data in arrays

Tools are plain objects. Agent configuration is an array of tools. No registry, no magic.

```typescript
const tools = [readFile, writeFile, shell]
```

Per-tool customization: swap or decorate the object.

```typescript
const myReadFile = { ...readFile, execute: (input) => /* custom */ }
const tools = [myReadFile, writeFile, shell]
```

Different agents get different arrays:

```typescript
const plannerTools = [readFile, listDir]           // read-only
const coderTools   = [readFile, writeFile, shell]  // full access
```

Collection helpers (`toolsWithMaxSafety`, `toolsWithoutCapability`, etc.) are just
array filters. No framework.

This matches the ecosystem: OpenCode, Claude Code, Codex, Vercel AI SDK all use
tools-as-collections.

## Two orthogonal customization levels

```
Consumer: [myReadFile, writeFile, shell]     ← WHICH tools, WHAT each does
                    │
         ToolExecutor (Layer)                ← HOW tools are called
```

**Per-tool** — modify the array (replace, decorate, filter). Consumer's concern.

**Cross-cutting** — swap the `ToolExecutor` Effect Layer (logging, capsule, permission
prompts, skill injection). Runtime's concern.

They compose independently. Neither knows about the other.

## Pipeline steps (future)

`callTool` will be decomposed into typed, composable steps:

```
decode(tool, raw) → execute(tool, input) → retry(effect) → validate(tool, output) → serialize(tool, output)
```

Each step is a standalone Effect function. `callTool` is the default composition.
Custom pipelines compose different steps. Advanced consumers only.

## ToolExecutor service (future)

```typescript
class ToolExecutor extends ServiceMap.Service<ToolExecutor>() {
  readonly call: (tool: ToolAny, raw: unknown) => Effect<string, ToolErrors>
}
```

Default: wraps `callTool`. Swap the Layer for instrumentation, mocking, etc.

## What's irreducible

| Thing | Status |
|---|---|
| `Tool<I, O>` (8 fields) | Built — `primitives/tool/index.ts` |
| `ToolError*` (4 error types) | Built — `primitives/tool/index.ts` |
| `callTool` (default pipeline) | Built — `primitives/tool/run.ts` |
| Tools as arrays | Locked design — no code yet |
| Pipeline step decomposition | Locked design — no code yet |
| `ToolExecutor` service | Locked design — no code yet |
| Tool decoration pattern | Convention — no types needed |
