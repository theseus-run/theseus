---
name: monorepo-maintenance
description: Use when changing package boundaries, splitting or moving modules, shaping public exports, naming APIs, reducing large files, or reviewing repo structure and maintainability in Theseus.
---

# Monorepo Maintenance

Use this skill for structural changes: package ownership, file shape, public API names, barrels, dependency direction, and maintainability reviews.

Do not use this skill for web-only `packages/icarus-web` work unless the user explicitly brings web structure into scope.

## First Pass

1. Read the nearest `package.json`, `tsconfig.json`, and current package exports before moving code.
2. Search for existing naming and module patterns with `rg`.
3. Identify the owning package before adding a type, service, runtime implementation, fixture, or test.
4. Prefer the smallest boundary that removes real coupling or file growth.
5. After moves or export changes, run the narrow typecheck or the root typecheck when signatures cross packages.

## Package Ownership

- `theseus-core` owns primitives, protocol contracts, service tags, and shared runtime types. It must not depend on tools, server, or web packages.
- `theseus-tools` owns concrete tool implementations. It may depend on `theseus-core`.
- `theseus-server` owns runtime assembly, persistence, RPC/HTTP wiring, and process-level service composition.
- `jsx-md` packages own prompt/document rendering utilities and should stay independent from runtime orchestration.
- Cross-package contracts belong in the lowest package that can own them without importing implementation concerns.
- If two packages need the same runtime behavior, first ask whether the behavior is actually a primitive contract, a server concern, or a duplicated convenience.

## File Shape

- Prefer modules with one reason to change.
- Split files when they mix public types, service tags, service implementations, persistence, command routing, serialization, fixtures, and test helpers.
- Keep orchestration files shallow: wire named pieces together, but move behavior into focused modules.
- Avoid "god files" that accumulate every variant of a primitive. A large file is a smell when unrelated sections can change independently.
- Avoid `utils.ts`, `helpers.ts`, `common.ts`, giant `types.ts`, and miscellaneous service bags. Prefer small named modules/services with a domain responsibility and direct tests.
- Do not split only by syntax category if the result separates code that must always be read together.
- Keep test fixtures and mocks out of production modules unless they are explicitly exported test utilities.

## Public API And Naming

- Prefer namespace-style public APIs for primitives, matching the existing Effect-style surface:
  - `import * as Tool from "@theseus.run/core/Tool"`
  - `Tool.Error<Input, Output, Error, Requirements>`
  - `Tool.Def<Input, Output, Error, Requirements>`
  - `Mission.Id`, `Mission.Record`, `Dispatch.Result`
- For public primitive barrels, favor short names that read clearly under the namespace. Prefer `Tool.Error` over `Tool.ToolError` when the namespace already supplies the subject.
- Keep globally matched runtime error classes prefixed when their `_tag` values must be unique, such as `ToolInputError` or `MissionErrorInvalidTransition`.
- Use the same word for the same concept across packages. Do not alternate between `result`, `outcome`, `response`, and `value` unless the concepts are intentionally different.
- Prefer named constructors for repeated protocol variants so call sites do not duplicate `_tag` literals or default fields.
- Keep generic parameter order stable for related types. For tool-like APIs, prefer input, output, error, requirements: `<Input, Output, Error, Requirements>`.
- Internal modules may use longer local names when that avoids ambiguity. Public barrels should make the imported namespace do useful naming work.

## API Surface Design

- Public APIs should expose domain intent, not implementation mechanics.
- Exported functions that define package or primitive contracts should have explicit return types.
- Avoid boolean parameter pairs and ambiguous positional flags. Use named options or discriminated unions.
- Avoid optional options bags that leak into implementation bodies as `options?.x`, `x ?? fallback`, or conditional object spreads. Normalize options once into a required internal shape.
- Avoid defaults creep: after a boundary normalizes input, downstream code should receive explicit values, not repeat fallbacks.
- Prefer explicit sentinel/domain values over absence when absence changes semantics, such as a root dispatch id instead of omitted `parentDispatchId`.
- Public/internal boundaries should make trust explicit: external inputs are decoded and normalized; internal protocol violations fail loudly instead of being recovered with fallback behavior.
- Avoid `Partial<T>` patch APIs for domain records. Prefer named domain commands with explicit invariants.
- Internal event/action names should be literal unions, schemas, or constructors. Plain `string` is for externally extensible names or raw undecoded input.
- Avoid overloads unless they materially improve call-site clarity and have a single coherent implementation model.
- Prefer stable constructors for protocol variants and errors over repeated object literals at call sites.
- Keep generic names descriptive in public examples and docs: `Input`, `Output`, `Error`, `Requirements` over single-letter aliases.
- Keep APIs narrow at the boundary and composable inside the package. Do not export helper internals just because tests or one consumer can reach them.
- When an API accepts unknown external data, pair it with a schema/decoder or a clearly named boundary function.

## Barrels And Exports

- Keep package and primitive barrels thin. They should expose the public surface, not contain runtime behavior.
- Prefer direct namespace imports from primitive barrels over root catch-all imports in examples and public docs.
- Do not add compatibility exports, duplicate old/new paths, or alias layers unless the user explicitly requires back compatibility.
- When replacing a public path without back compatibility, remove stale exports, comments, tests, and docs in the same pass when feasible.
- Match `package.json` exports, TypeScript path aliases, and source entrypoints.

## Review Checklist

- Does every changed module have one clear owner?
- Did any package import upward into a higher-level package?
- Did a public name become redundant under its namespace?
- Did a public API expose implementation details or ambiguous boolean flags?
- Did a file start mixing contracts, implementation, persistence, and tests?
- Did a move leave stale exports, compatibility shims, or duplicate concepts?
- Is verification scoped to the packages whose public surface changed?
