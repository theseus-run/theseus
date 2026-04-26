---
name: typescript-strict
description: Use when writing, refactoring, reviewing, or debugging strict TypeScript in this repo, including tsconfig paths, package exports, typecheck failures, unknown vs any, readonly data, module boundaries, and Effect language-service diagnostics.
---

# TypeScript Strict

Use this skill for TypeScript mechanics that are not specific to Effect.

## Repo Facts

- Root `tsconfig.json` is strict and no-emit.
- Module mode: `Preserve`; module resolution: `bundler`.
- TS extension imports are allowed.
- `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `noPropertyAccessFromIndexSignature` are enabled.
- `@effect/language-service` is configured in root `tsconfig.json`.
- Root typecheck runs package configs explicitly.

## Type Rules

- Prefer `unknown` over `any` at external boundaries.
- Narrow `unknown` before use.
- Use explicit return types on exported functions when they define public API.
- Use `ReadonlyArray<T>` and readonly object fields for inputs and data contracts.
- Prefer literal unions or `as const` objects over numeric enums.
- Use template literal types or branded types for structured strings that cross boundaries.
- Avoid non-null assertions; prove presence through narrowing.
- Avoid type assertions that erase useful errors or requirements.

## Module And Package Rules

- Keep package public exports intentional.
- Match `package.json` exports with actual source entrypoints.
- Use workspace path mappings from package `tsconfig.json`; do not invent import paths.
- Keep browser-safe packages free of Bun-only imports.
- Keep generated `dist/` output derived from source.

## Typecheck Workflow

1. Read the relevant package `tsconfig.json`.
2. Reproduce with the narrow package typecheck if available.
3. Fix the type model, not just the local symptom.
4. Run `bun run typecheck` for cross-package signatures, exports, schemas, or shared types.

## Error-Handling Types

- Use typed result/error models for recoverable failures.
- In Effect code, preserve the `E` channel instead of collapsing errors to `unknown`.
- In non-Effect code, prefer discriminated unions for recoverable results when exceptions are not the right boundary.

## Anti-Patterns

- Do not use `as any` or `as never` to escape a type error without explaining the invariant.
- Do not widen closed sets to `string` unless external extensions can add values at runtime.
- Do not use `T[]` for input collections that should not be mutated.
- Do not add default exports to packages that use named export style.
- Do not hide package-boundary type errors by changing root compiler options.

