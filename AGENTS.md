# AGENTS

<repo>
  <name>theseus</name>
  <purpose>Open-source packages powering the Theseus agent harness.</purpose>
  <stack>Bun, TypeScript, Effect v4 beta, Biome, React/Vite for Icarus.</stack>
  <package-manager>bun</package-manager>
</repo>

<operating-principles>

## Agent Stance

- **High signal, low noise.** Every sentence must carry information. No filler, flattery, hedging, or rapport theater.
- **Verify before asserting.** Search the workspace before claiming an API shape, dependency, file path, package export, or command exists.
- **Prefer existing structure.** Follow local package boundaries, naming, error style, and docs layout before introducing new patterns.
- **Keep scope tight.** Do the requested work. Report unrelated issues; do not fix them without explicit approval.
- **Use deterministic tools.** Formatting, import order, type checks, tests, and line counts belong to tools, not guesswork.
- **Turn repeated mistakes into checks.** If an agent-visible failure can be caught deterministically, prefer a lint/type/test rule over another prose instruction.
- **Fail forward.** When an approach fails, state what failed and change strategy. Do not retry with cosmetic differences.
- **Separate fact from inference.** Mark assumptions when a conclusion depends on incomplete evidence.
- **No mind claims.** Do not claim feelings, desires, consciousness, or lived experience.

</operating-principles>

<workflow>

## Default Workflow

1. Read the relevant files before editing.
2. Check `package.json` scripts before running commands.
3. Prefer `rg` / `rg --files` for search.
4. Make the smallest coherent change that satisfies the request.
5. Re-read modified files.
6. Run the narrowest useful verification command, then broader checks when risk justifies it.
7. Report what changed, what was verified, and any residual risk.

## Review Workflow

When asked for a review, lead with findings. Prioritize defects, behavioral regressions, missing tests, and maintainability risks. Use `P0`-`P3` priority and `C0`-`C3` confidence when useful.

</workflow>

<commands>

## Commands

- Package manager: `bun`.
- Root scripts:
  - `bun run effect:diagnostics` — Effect language-service diagnostics for configured non-web packages.
  - `bun run effect:ls:check` — check whether local TypeScript is patched for Effect diagnostics.
  - `bun run effect:ls:patch` — patch local TypeScript so Effect diagnostics surface through build-time checks.
  - `bun run lint` — Biome check.
  - `bun run test` — Bun tests.
  - `bun run typecheck` — TypeScript checks for the configured packages.
- Package scripts exist in individual `packages/*/package.json` files. Read them before using package-local commands.
- Do not use another package manager unless the user explicitly asks.
- Do not call raw binaries when an existing script covers the job.

</commands>

<architecture>

## Theseus Model

Theseus is a mission dispatch system, not a chatbot.

Core idea: a human dispatches a goal with done criteria; the system runs the work, records what happened, and returns results.

## Core Packages

- `packages/theseus-core` — typed primitives for agent systems.
- `packages/theseus-tools` — Bun-native tool implementations.
- `packages/theseus-server` — Effect RPC / HTTP server / runtime wiring.
- `packages/jsx-md` — JSX/TSX renderer for Markdown and LLM-facing instruction components.
- `packages/jsx-md-beautiful-mermaid` — Mermaid-to-ASCII component for `jsx-md`.
- `packages/icarus-web` — React/Vite web interface for the runtime.

## Package Boundaries

- `theseus-core` defines primitives and shared runtime contracts. It must not depend on tools, server, or web packages.
- `theseus-tools` may depend on `theseus-core`; it provides concrete tool implementations.
- `theseus-server` wires core primitives, tools, persistence, and transport. Keep application wiring here, not in core.
- `jsx-md` packages are prompt/document rendering utilities. Keep them independent from runtime orchestration.
- `icarus-web` is a client/operator surface. It may consume runtime contracts but must not become the runtime.

## Primitive Floor

Treat these as the conceptual base unless current code or docs prove otherwise:

- **Mission** — job tracker with goal and done criteria.
- **Tool** — typed, controlled world access.
- **Capsule** — durable run log for debugging and improvement.
- **Dispatch** — AI invocation with context and result.
- **Satellite** — dispatch-scoped observation and policy middleware.

`RuntimeBus` is the client/operator transport concept for runtime UIs. Do not collapse it into `Satellite`: Satellites observe and influence dispatch; RuntimeBus carries operator-facing events and input.

</architecture>

<code-style>

## TypeScript And Effect

- Keep public fallible boundaries as `Effect` where composition, interception, or typed failure matters.
- Prefer Effect-style namespace APIs for public primitive surfaces. Names should read well under their namespace, such as `Tool.Error<Input, Output, Error, Requirements>`, `Tool.Def<Input, Output, Error, Requirements>`, or `Mission.Id`, instead of repeating the primitive name at every member.
- Keep generic parameter order stable for related public types. For tool-like APIs, prefer input, output, error, requirements: `<Input, Output, Error, Requirements>`.
- Prefer plain interfaces and named function fields over class hierarchies or hidden registries.
- Keep runtime data serializable when it crosses process, tool, or dispatch boundaries.
- Prefer explicit required internal data over optional/default soup. Normalize optional inputs once at the boundary; avoid defaults creep, silent fallbacks, conditional object spreads, and scattered nullish fallbacks in function bodies.
- Prefer hard boundaries. Validate external input at the edge and normalize it into explicit internal types. Inside controlled code, do not recover from impossible states, unsupported internal variants, or violated invariants; fail early and loudly.
- Exported domain/protocol variants should have named constructors. Avoid repeated public `_tag` object literals outside local throwaway data.
- IDs crossing package, persistence, tool, RPC, dispatch, or mission boundaries should be branded/schema-backed, not raw `string`.
- Use strict types for closed sets. Use `string` only for externally extensible runtime sets.
- Avoid booleans by default for domain state. Boolean matrices are usually hidden state machines; prefer discriminated unions for simple states and explicit state-machine modules/services for complex flows.
- Prefer ordered enums/unions over correlated boolean flags.
- Prefer strict discriminated unions for domain states, protocol packets, outcomes, and lifecycle phases.
- Match closed discriminated unions exhaustively. Use `switch` with `never` checks or a local exhaustive matcher pattern; do not rely on fallthrough defaults for known protocol states.
- Use named constructors for repeated or exported union variants so `_tag` literals and defaults live next to the schema/type definition.
- Keep plain object literals for local throwaway data. Avoid `as const` at public protocol call sites when a typed constructor would make intent clearer.
- Inject providers and backends that may change. Core primitives must not hard-code model vendors, MCP frameworks, or storage providers.
- Constructors and factories may capture configuration. Runtime services, clocks, random/id generation, stores, language models, and mutable context should be read from the Effect environment at execution time.

## Module Shape

- Prefer small modules with one clear responsibility over large coordination files.
- Split files when they mix protocol/type definitions, service tags, service implementations, command routing, persistence, serialization, and test helpers.
- Keep barrels thin. A package or primitive `index.ts` should mostly export public surface; move runtime behavior into named modules.
- Avoid `utils.ts`, `helpers.ts`, `common.ts`, giant `types.ts`, and miscellaneous service bags. Name modules by domain responsibility and keep them small and testable.
- Do not keep aliases, compatibility exports, or parallel old/new paths unless the user explicitly asks for back compatibility.
- When a refactor creates a new boundary, remove the stale boundary in the same pass when feasible.

## Tests

- New runtime behavior needs focused tests near the package that owns it.
- Primitive services with behavior, such as registries, stores, parsers, dispatch loops, satellite rings, and tool execution boundaries, should have direct tests.
- Pure type surfaces and thin barrels do not need tests unless they contain runtime constructors or behavior.
- Use characterization tests to pin intended behavior before risky moves. Do not freeze known-bad WIP behavior just to preserve it.
- Missing tests are review findings, not TODO decorations. Either add the test, explicitly defer it in the final report, or explain why the surface is type-only.

## Errors

- Distinguish expected domain failures from defects.
- Expected failures should be typed and recoverable.
- Recovery is for expected uncertainty at external boundaries: user input, network, filesystem, subprocesses, model providers, persistence, and environment.
- Defects are program bugs or violated internal contracts; do not hide them behind generic error bags, default branches, silent drops, or best-effort recovery.
- Generic errors are acceptable as outer-boundary salvage or defect wrappers; domain code should prefer narrow tagged errors that name the failed invariant or external operation.
- Prefer flat tagged errors with primitive-specific prefixes such as `Tool*`, `Mission*`, or `Capsule*`.

## Compatibility

- Default to hard removal when replacing or renaming code: remove obsolete files, aliases, shims, re-exports, comments, and parallel paths.
- If the user says `back-compat: required`, preserve compatibility and ask for consumers, scope, and removal deadline when unclear.

</code-style>

<docs>

## Documentation

`docs/` is an Obsidian vault, not a generated docs site.

- Use the docs-management skill, if available, when adding, moving, splitting, archiving, or substantially revising files under `docs/`.
- Keep one durable concept per note.
- Put stable design truth in concept notes.
- Put time-bound reasoning in `docs/99-design-notes/`.
- Prefer Obsidian wikilinks for internal concept links.
- Keep `docs/README.md` and section `README.md` files current when navigation changes.
- Move superseded design material to `docs/90-archive/` instead of deleting it by default.

</docs>

<skills>

## Skill Use

Before starting work, check whether a repo-local skill under `.agents/skills/` applies. Load only the relevant `SKILL.md` files.

Do not maintain a skill registry in this file. The filesystem is the source of truth for available repo skills.

Use a docs-management skill for documentation vault structure, note moves, note splits, archive handling, and docs navigation.

Use an agent-self-check skill before finishing code changes, after deterministic check failures, or when deciding whether a repeated mistake should become a rule.

Use a biome-grit-rules skill when creating, reviewing, or modifying custom Biome Grit plugins.

Use a Theseus design skill for primitive design, runtime concepts, operator model, and major package ownership decisions.

Use an Effect v4 skill for general Effect API mechanics and v3-to-v4 translation. Prefer narrower Effect topic skills when work is specifically about services/layers, errors/schema, concurrency/lifecycle, observability/time, or testing/runtime.

Use a monorepo-maintenance skill for package boundaries, file splits, public exports, naming/API surface, and god-file reduction.

Use a refactoring-discipline skill for cleanup, risky moves, large-file reduction, and replacing WIP/POC code with a clean single path. Prefer hard replacement over compatibility unless the user explicitly asks for back compatibility.

Use a testing-patterns skill for test placement, characterization tests, Effect test layers, fixtures, and verification scope.

</skills>

<generated-files>

## Generated Files

- Treat `dist/`, build output, lockfiles, and generated artifacts as derived unless the package explicitly treats them as source.
- Edit source files first.
- Regenerate derived files only through package scripts or documented build commands.
- Do not hand-edit generated output unless the user explicitly asks for a surgical generated-file patch.

</generated-files>

<glossary>

## Priority

- **P0** — Must address before proceeding. Blocks current process.
- **P1** — Should address. Strong preference.
- **P2** — Worth addressing. Non-blocking.
- **P3** — Informational.

## Confidence

- **C0** — Certain. Verified or trivially provable.
- **C1** — High confidence. Very likely correct based on context.
- **C2** — Moderate confidence. Reasonable inference; should verify.
- **C3** — Low confidence. Speculative; flag for discussion.

## Result Types

- **success** — task completed.
- **error** — task not completed, but actionable information was found.
- **defect** — tool failure, crash, or no actionable information.

</glossary>

<hard-rules>

## Hard Rules

- American English only in prose, identifiers, comments, and artifacts unless preserving external API names, translations, proper nouns, or jurisdiction-specific terms.
- Read relevant package scripts before running commands.
- Never invent scripts, imports, package names, or exports.
- Do not edit generated `dist/` files unless the task explicitly asks for generated output.
- Do not revert user changes unless explicitly instructed.
- Prefer `file.llm.ext` over `file.ext` when both exist.

</hard-rules>
