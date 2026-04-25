# Cortex POC: tool-result folding with recall

Status: POC note, not final design.

Date: 2026-04-25

## Why this POC

The smallest useful Cortex proof-of-concept is tool-result folding with recall.

It proves the important primitive:

```text
visible context can shrink
exact source evidence remains archived
the model can recover it when needed
```

This avoids early commitment to:

- exact Cortex item schema
- final tool names
- final receipt wording
- final storage backend
- final prompt placement strategy
- skill activation policy
- AGENTS.md / project-instruction placement
- LLM summarization prompts

## Current Theseus fit

The existing dispatch and satellite system already has the required hooks.

Relevant existing primitives:

- `afterTool` satellite hook receives the tool call and full result.
- `ReplaceToolResult` can replace what the model sees.
- tools can read shared Effect services.
- satellite actions are emitted as events when a non-pass decision happens.

This means the POC should not require a dispatch-loop rewrite.

## Proposed pieces

### 1. CortexArchive

Experimental in-memory service.

Responsibility:

```text
put full tool result payload -> recall handle
get recall handle -> full tool result payload
```

For the first POC, store only text.

Later extensions:

- full `Presentation`
- structured payload
- multimodal blocks
- provenance
- hashes
- persistence
- per-agent / per-dispatch / per-mission access controls
- query search

Rough shape:

```ts
type CortexRecallHandle = string

type ArchivedToolResult = {
  id: CortexRecallHandle
  dispatchId: string
  callId: string
  tool: string
  args: unknown
  text: string
  createdAt: number
}

interface CortexArchive {
  putToolResult(input: Omit<ArchivedToolResult, "id" | "createdAt">): Effect<CortexRecallHandle>
  getToolResult(id: CortexRecallHandle): Effect<ArchivedToolResult | undefined>
}
```

Do not over-design this yet.

### 2. cortexToolResultFolder satellite

Hook:

```text
afterTool
```

Behavior:

```text
if tool result is under threshold:
  Pass

if tool result is over threshold:
  archive exact text
  ReplaceToolResult with a receipt
```

Threshold can be simple for the POC:

```text
maxVisibleChars: number
previewChars: number
```

Receipt example:

```text
[Cortex folded tool result]
id: cortex_tool_result:abc123
tool: shell
callId: call_123
originalChars: 84210

Preview:
<first useful lines / clipped prefix>

The full result is archived. Use Cortex recall with id
"cortex_tool_result:abc123" if exact output is needed.
```

This wording is not final. The primitive is the receipt plus recall handle.

### 3. cortex_recall tool

Experimental tool included in the dispatch spec for the POC.

Input:

```ts
{ id: string }
```

Output:

```text
exact archived text
```

The final system may not expose this as a normal model tool. It may become:

- a model tool
- an MCP resource
- a runtime-only operation
- a UI action
- an automatic renderer hydration step

For the POC, make it a normal tool because that proves the loop with minimal
infrastructure.

## Desired test

One focused end-to-end test:

```text
1. model calls large_output_tool
2. tool returns a large text result
3. cortexToolResultFolder archives full text
4. next model prompt contains receipt, not full huge text
5. model calls cortex_recall({ id })
6. recall tool returns the exact original text
7. next model prompt contains the recovered text
```

Assertions:

- folded prompt does not contain full large output
- folded prompt contains recall handle
- archive contains exact original output
- recall output equals exact original output
- satellite action event records `ReplaceToolResult`

## Why not start elsewhere

### Not AGENTS.md / project instructions first

Instruction placement is important, but it opens too many design questions:

- authority ordering
- provider message placement
- conflict resolution
- nested scope
- renderer semantics
- UI visibility

Those are Cortex concerns, but they are not the easiest first proof.

### Not skill activation first

Skill activation is also important, but it depends on:

- skill index format
- trigger metadata
- model-requested vs runtime-triggered activation
- placement and authority
- lifecycle rules

Useful, but more design-heavy than folding tool results.

### Not LLM summarization first

LLM summaries are useful, but the first POC should be deterministic.

The invariant should be:

```text
lossy visible representation
lossless archived source
```

Once that invariant is solid, summaries can become optional metadata attached to
receipts.

## What this proves

This POC exercises durable Cortex primitives:

- fidelity downgrade: verbatim -> receipt
- archive
- recall handle
- provenance
- audit event
- model-visible recovery affordance

It does not prove:

- global context ranking
- domain-neutral ContextItem schema
- skill activation
- instruction placement
- persistent memory
- semantic summarization
- cross-agent policy

That is fine.

## POC file sketch

Possible files:

```text
packages/theseus-core/src/cortex/archive.ts
packages/theseus-core/src/cortex/tool-result-folder.ts
packages/theseus-core/src/cortex/recall-tool.ts
packages/theseus-core/src/cortex/index.ts
packages/theseus-core/src/cortex/tool-result-folder.test.ts
```

Keep exports local until the shape stabilizes.

## Open questions

- Should the archive be dispatch-scoped or mission-scoped for the POC?
- Should recall return text only or reconstruct a tool-result `Presentation`?
- Should folded receipts include args?
- Should folded receipts include hashes?
- Should recall handles be stable across restore?
- Should large failed tool results fold differently than successful ones?
- Should the receipt say "use recall" explicitly or rely on tool description?
- Should the folder fold every large result or only old large results?
- Should multiple duplicate results point to one archive item?

## Suggested first implementation constraint

Make the first version intentionally dumb:

```text
fold only by character threshold
archive exact text
receipt includes id, tool, callId, originalChars, preview
recall by exact id only
in-memory only
no LLM summarization
no dedupe yet
```

If this works cleanly, the next POC can add deterministic dedupe:

```text
same tool + same args + same text hash -> one canonical archive item
```
