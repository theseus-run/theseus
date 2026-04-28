---
name: agent-self-check
description: Use before finishing coding work or after deterministic check failures, including lint/typecheck/test loops, interpreting diagnostics as just-in-time prompts, and deciding whether repeated agent mistakes should become stricter rules.
---

# Agent Self Check

Use this skill to close the write-check-fix loop. Deterministic diagnostics are stronger than prompt instructions.

## Core Rule

Treat lint, type, language-service, and test failures as prompts attached to exact code locations. Fix the root cause, then re-run the narrowest check that can prove it.

## Workflow

1. Run the narrowest relevant check after source edits.
2. Read diagnostics literally: file, span, rule, message, expected fix.
3. Load any skill named by the diagnostic message.
4. Fix the source pattern, not only the immediate line.
5. Re-run the failed check.
6. Self-review the changed code for agent-shaped leftovers and weak modeling.
7. If the same class of mistake appears repeatedly, ask whether it can be caught deterministically.

## Self-Review Pass

Before finalizing code changes, inspect the diff as if reviewing another agent's work.

Fix these directly when they are in your changed code:

- closed protocol/domain/state handling written as if/else return soup instead of exhaustive `Match` or `switch` with a `never` check
- boolean matrices where a discriminated union or explicit state machine would make the state space clear
- optional/default soup: scattered `options?.x`, `x ?? fallback`, conditional object spreads, or defaults repeated inside function bodies instead of one boundary normalizer
- unsupported internal variants hidden behind fallback/default branches instead of failing loudly
- repeated exported `_tag` object literals that should use named constructors
- raw `string` IDs crossing package, persistence, tool, RPC, dispatch, or mission boundaries where a branded/schema-backed ID is expected
- broad `Record<string, unknown>` values flowing past ingress without schema decoding or an explicit extension point
- constructors/builders that perform I/O, allocate runtime resources, read config, call providers, or start fibers
- large mixed modules, stale aliases, compatibility wrappers, empty stubs, or old/new parallel paths left by the change
- missing focused tests for new runtime behavior, service behavior, boundary translation, constructors with defaults, or changed protocol variants

Do not preserve bad code because checks pass. If a cleanup may change public behavior or compatibility, stop and report it instead of deleting it silently.

## Rule Escalation

Consider adding or tightening a rule when:

- the bad pattern is syntactically recognizable
- the desired fix is deterministic or explainable in one diagnostic
- false positives are expected to be low
- the mistake is repeated, high-risk, or caused by stale model training data
- the rule would save future agents from relearning the same correction

For Biome/Grit rules, use `biome-grit-rules`.

## Severity

- `error` - project invariant, stale API, unsafe pattern, or known agent trap.
- `warning` - style preference, migration aid, or pattern with valid exceptions.
- do not add a rule when the decision needs semantic judgment the checker cannot prove.

## Final Check

Before final response:

- report which checks ran
- report failures that remain and why
- do not claim a check passed unless it was run after the final relevant edit
- report any self-review concerns you intentionally deferred
