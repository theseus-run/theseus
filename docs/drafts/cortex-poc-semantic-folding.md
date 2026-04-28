---
status: draft
owner: drafts
kind: draft
updated: 2026-04-28
---

# Cortex POC: semantic folding of bounded spans

Status: POC note, not final design.

Date: 2026-04-25

## Why this POC

The first Cortex POC is deterministic tool-result folding:

```text
large tool result -> archive exact text -> visible receipt
```

This second POC explores the LLM-powered version:

```text
bounded span of old messages/tools -> archive exact span -> visible semantic fold
```

The goal is not whole-session compaction. The goal is to compress a small,
runtime-selected span into a replacement item while preserving exact recall.

## Core invariant

The summary is not authority.

The archive is authority.

The visible context may become lossy, but the exact source span must remain
recoverable.

```text
lossy semantic fold in hot context
lossless archived span in cold context
```

## What this should prove

This POC should prove the next Cortex primitive:

```text
multiple old steps can be replaced by one semantic context item
without deleting exact source material
```

It exercises:

- span archive
- recall handle
- fidelity downgrade: verbatim span -> semantic fold
- bounded LLM summarization
- runtime-selected compaction scope
- audit event

It should not prove:

- arbitrary whole-conversation summarization
- final ContextItem schema
- final prompt placement
- final summary prompt
- final recall tool name
- cross-agent memory
- persistent storage

## Start with failure bursts

The best first semantic-folding target is a resolved failure burst.

Pattern:

```text
assistant tries something
tool fails
assistant adjusts
tool fails
assistant adjusts
tool fails
assistant adjusts
tool succeeds
```

After success, the model usually does not need every failed attempt verbatim.
It needs:

- what was tried
- why it failed
- what finally worked
- whether anything remains unresolved
- where exact details live

This is a bounded and useful summarization job.

## Example replacement

```text
[Cortex semantic fold]
id: cortex_fold_123
type: failure-burst
sourceSpan: cortex_span_123
status: resolved

## What Happened
The agent tried running `bun test` several times while implementing Cortex
tool-result folding. Initial failures were caused by missing Effect service
provisioning and then an incorrect prompt assertion.

## Outcome
The final test run passed after adding the CortexArchive layer and updating the
expected folded receipt text.

## Retained Facts
- test file: packages/theseus-core/src/cortex/tool-result-folder.test.ts
- final fix: provide CortexArchive in the test layer
- no remaining failing tests in this burst

## Recall
Exact archived span: cortex_span_123
```

Wording is not final. The primitive is:

```text
semantic fold + source span id + exact recall
```

## Span selection should be deterministic

The LLM should not decide what to delete from the whole history.

The runtime should select a candidate span first, using mechanical rules.

Initial candidate rules:

```text
same dispatch / same task phase
older than preserve_recent
contains repeated tool failures or noisy attempts
ends in success or explicit abandonment
does not include user constraints
does not include policy/instructions
does not include pinned items
does not include unresolved blockers
does not include the latest active evidence
```

Bad:

```text
LLM, inspect the entire transcript and decide what can be removed.
```

Good:

```text
Runtime selects span A..B.
LLM summarizes only span A..B using a strict prompt.
Runtime archives exact span and replaces it with the fold.
```

## Summarizer prompt constraints

The LLM summarizer should receive:

- source span
- fold type
- desired output schema
- warning not to invent
- instruction to preserve exact paths, commands, identifiers, errors, and final outcome

Rough prompt:

```text
You are creating a Cortex semantic fold for a bounded span of agent history.

The full source span will be archived and recallable. Your job is to produce a
compact replacement for hot context.

Rules:
- Do not mention facts not present in the span.
- Preserve exact file paths, commands, identifiers, and error strings when important.
- Distinguish failed attempts from the final outcome.
- Say whether the span is resolved, unresolved, or abandoned.
- If something may still matter, put it under Still Relevant.
- Keep it short.

Output exactly:

[Cortex semantic fold]
type: <failure-burst | evidence-group | phase-summary>
status: <resolved | unresolved | abandoned | unknown>

## What Happened
...

## Outcome
...

## Retained Facts
- ...

## Still Relevant
- ...
```

The recall handle can be inserted by the runtime after summarization.

## What not to fold in the POC

Do not fold:

- recent N turns
- user requirements
- acceptance criteria
- system/developer/org policy
- active plan
- unresolved blocker
- permission/security decisions
- fresh evidence the model is about to use
- anything without an exact archived source span

## Desired test

One focused test:

```text
1. construct a dispatch history with repeated failing tool results
2. end the span with a succeeding tool result
3. semantic folder deterministically selects that span
4. mock summarizer returns a structured fold
5. runtime archives the exact original span
6. before next model call, history contains one fold replacement
7. folded history does not contain every failed tool result
8. recall_span(id) returns exact original span
```

Assertions:

- exact source messages are archived
- hot context contains the semantic fold
- hot context contains source span recall id
- folded failures are not all present verbatim
- recall restores exact source span
- fold has audit event

## Relationship to deterministic folding

First POC:

```text
single large tool result -> deterministic receipt
```

Second POC:

```text
bounded multi-step span -> LLM semantic fold + receipt
```

Together:

```text
verbatim -> receipt                  deterministic
span -> semantic fold + receipt       LLM-powered
```

## Possible files

Do not treat this as final structure.

Possible sketch:

```text
packages/theseus-core/src/cortex/span-archive.ts
packages/theseus-core/src/cortex/semantic-folder.ts
packages/theseus-core/src/cortex/failure-burst.ts
packages/theseus-core/src/cortex/recall-span-tool.ts
packages/theseus-core/src/cortex/semantic-folder.test.ts
```

The implementation may reuse the same archive service as the deterministic
tool-result folding POC.

## Open questions

- What is the simplest representation of an archived span?
- Should the fold replace messages in the dispatch store, or only the rendered
  prompt before call?
- Should semantic folding run synchronously before call or asynchronously in a
  background satellite?
- How many recent turns must be protected?
- Should failure-burst selection require a succeeding tool result?
- How to detect "explicit abandonment"?
- Should folded spans retain assistant messages, tool messages, or both?
- Should recall return raw model messages or a readable transcript?
- Should the summarizer see raw provider messages or normalized transcript?
- How do we evaluate summary quality without overfitting?

## Suggested first implementation constraint

Make the first version narrow:

```text
only fold old failure bursts
span selection is deterministic
summarizer is mocked in tests
archive exact normalized transcript
render one Markdown fold replacement
recall by exact id only
no semantic search
no persistence
no dedupe
no whole-session compaction
```

If that works, next extensions:

```text
evidence group folding
phase summary folding
background summarization
summary quality checks
fold replacement as typed ContextItem
```
