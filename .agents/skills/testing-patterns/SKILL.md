---
name: testing-patterns
description: Use when adding, refactoring, reviewing, or debugging tests in Theseus, especially package-local test placement, characterization tests, Effect service tests, fixtures, mocks, and deciding how broad verification should be.
---

# Testing Patterns

Use this skill for deciding what to test, where tests belong, and how broad verification should be. Use the `bun-test` skill for Bun test runner mechanics.

Do not use this skill for web-only `packages/icarus-web` testing unless the user explicitly asks to cover web.

## Placement

- Put tests near the package that owns the behavior.
- Prefer package-local `src/**/*.test.ts` or `src/**/*.test.tsx` patterns already used by the package.
- Keep reusable test helpers under a package-local test utility module. Do not leak helpers into public exports unless they are intended public test utilities.
- Cross-package behavior should be tested at the lowest package that can observe it. Use server-level tests only for real wiring, persistence, transport, or runtime assembly.

## What Needs Tests

- New runtime behavior needs focused tests.
- Services with behavior need direct tests: registries, stores, parsers, dispatch loops, satellite rings, tool execution boundaries, persistence adapters, and protocol serializers.
- Constructors for exported protocol variants need tests when they apply defaults, normalize input, or enforce invariants.
- Pure type surfaces and thin barrels do not need runtime tests unless they contain constructors or behavior.
- Refactors of working behavior should start with characterization tests when the current behavior is not already pinned down.

## Effect Tests

- Keep Effect at the boundary of the test. Build the program, provide test layers, then run with `Effect.runPromise` or the repo's existing test helper.
- Prefer test layers and fake services over global mutation.
- Keep typed expected failures in the error channel when that is the contract being tested.
- Test defect paths separately from expected domain failures.
- When a service requires time, randomness, IDs, storage, or a language model, inject a deterministic test service instead of relying on ambient behavior.

## Bun Test Style

- Import test APIs from `bun:test`.
- Prefer direct assertions for small units and table tests for closed protocol variants.
- Use mocks and spies only at process or dependency boundaries. Prefer fake services for domain logic.
- Keep snapshots for stable rendered output or protocol artifacts. Avoid snapshots for logic that would be clearer as explicit assertions.
- Avoid broad root test runs while iterating when a package-local test reproduces the issue.

## Fixtures

- Name fixtures by the behavior they support, not by incidental data shape.
- Keep fixtures small and local until multiple tests need the same object.
- Use constructors or builders for protocol variants with required defaults. Do not duplicate `_tag` literals and default fields across tests.
- Do not make a shared fixture so configurable that each test has to mentally execute a framework.

## Verification Scope

- Run the narrowest useful test during iteration.
- Run `bun run typecheck` when changing public types, package exports, Effect environments, schemas, or cross-package signatures.
- Run broader tests when behavior crosses package boundaries or when a refactor moves ownership.
- In reviews, missing tests are findings. Either add the test, defer it explicitly, or explain why the changed surface is type-only.

## Anti-Patterns

- Do not add tests only around mocks while leaving the real behavior unexercised.
- Do not hide flaky timing with sleeps; inject clocks or await deterministic signals.
- Do not test through the server when the owning primitive can be tested directly.
- Do not create one giant integration test for several unrelated behaviors.
- Do not leave TODO comments for obvious missing tests; either write them or call out the gap.
