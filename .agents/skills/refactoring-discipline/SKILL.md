---
name: refactoring-discipline
description: Use when cleaning up, restructuring, splitting, renaming, replacing, or reducing complexity in this POC/WIP repo, especially when choosing a clean single path over compatibility, stale aliases, or parallel implementations.
---

# Refactoring Discipline

Use this skill for cleanup and replacement work in this POC/WIP repo. We are the only expected consumers unless the user says otherwise, so prefer clean one-way changes over compatibility-preserving migrations.

For package boundaries and public export shape, also use `monorepo-maintenance`. For tests, also use `testing-patterns`. After substantial edits, use `cleanup-audit` as a finishing pass to remove confirmed leftovers and report risky compatibility cleanup before changing it.

## Ground Rule

This repo optimizes for a clean golden path, not compatibility layers.

- Prefer replacing bad or obsolete structure over preserving it.
- Delete stale aliases, compatibility exports, comments, tests, docs, and duplicate paths when the new boundary supersedes them.
- Preserve behavior only when that behavior is still part of the intended model.
- If current behavior is accidental or WIP, improve it directly and say what changed.

## Workflow

1. Identify the intended model, not just the current behavior.
2. Search current callers and tests so the blast radius is known.
3. Choose the clean target shape before patching.
4. Replace in one coherent direction; avoid old/new parallel paths.
5. Update tests to the intended behavior, or add tests for the new boundary when behavior matters.
6. Run the narrowest useful test/typecheck, then broader verification when public signatures changed.

## Scope Control

- It is fine to combine renames, moves, and behavior correction when they are all part of replacing one bad model with one better model.
- Do not preserve obsolete APIs just because tests or local callers use them. Update the callers/tests.
- Do not add migration shims unless the user explicitly says back compatibility is required.
- Keep diffs reviewable: one conceptual replacement per pass is better than several unrelated cleanups.
- If a cleanup reveals an unrelated design problem, report it or make it a separate pass.

## Good Targets

- duplicated protocol construction
- large modules with unrelated reasons to change
- hidden dependencies or ambient state
- repeated validation/stringification inside domain code
- unclear names that force readers to inspect implementation
- tests that only assert legacy shape instead of intended behavior
- old aliases, stale barrels, and compatibility re-exports
- parallel implementations of the same concept

## Poor Targets

- style-only churn in unrelated files
- mechanical renames without a clearer model
- abstractions created for one caller
- preserving a second path "just in case"
- characterization tests that freeze known-bad WIP behavior

## Verification

- Prefer package-local tests while iterating.
- Run root typecheck when public signatures, package exports, schemas, or Effect requirements change.
- Use lint/format tooling for mechanical cleanup; do not hand-normalize formatting across unrelated files.
- In the final report, say whether behavior was intentionally changed, which stale paths were removed, and what verification covered.
