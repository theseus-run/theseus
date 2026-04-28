# AGENTS

<repo>
  <name>theseus</name>
  <purpose>Open-source packages powering the Theseus agent harness.</purpose>
  <stack>Bun, TypeScript, Effect v4 beta, Biome, React/Vite for Icarus.</stack>
  <package-manager>bun</package-manager>
</repo>

<operating-principles>

## Agent Stance

- **High signal, low noise.** Every sentence must carry information.
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

- Use `bun`.
- Read root and package-local `package.json` scripts before running commands.
- Do not use another package manager unless the user explicitly asks.
- Do not call raw binaries when an existing script covers the job.

</commands>

<architecture>

## Theseus Model

Theseus is a mission dispatch system, not a chatbot. A human dispatches a goal with done criteria; the system runs the work, records what happened, and returns results.

## Package Boundaries

- `packages/theseus-core` owns primitives and shared contracts. It must not depend on tools, server, runtime, or web packages.
- `packages/theseus-tools` owns Bun-native concrete tool implementations. It may depend on `theseus-core`.
- `packages/theseus-runtime` owns live mission/runtime orchestration, systems, sinks, projections, active dispatch tracking, persistence-backed runtime state, and tool/model catalog hydration. It must not depend on server or web packages.
- `packages/theseus-server` owns HTTP/RPC transport, provider configuration, process startup, and final layer assembly.
- `packages/jsx-md` and `packages/jsx-md-beautiful-mermaid` own prompt/document rendering utilities and should stay independent from runtime orchestration.
- `packages/icarus-web` is a client/operator surface. It may consume runtime contracts but must not become the runtime.

## Primitive Floor

Treat these as the conceptual base unless current code or docs prove otherwise:

- **Mission** — job tracker with goal and done criteria.
- **Tool** — typed, controlled world access.
- **Capsule** — durable run log for debugging and improvement.
- **Dispatch** — AI invocation with context and result.
- **Satellite** — dispatch-scoped observation and policy middleware.

`RuntimeBus` is the client/operator transport concept for runtime UIs. Do not collapse it into `Satellite`.

## Harness Shape

- The current runtime architecture is a host/world model, not the old persistent named-agent daemon model. Read `docs/runtime/architecture.md` before changing runtime code.
- Theseus is a self-editable harness, not a plugin host. Do not introduce plugin APIs, manifests, dynamic loading, generic extension registries, or marketplace-style compatibility promises unless explicitly requested.
- Harness behavior must use explicit assembly. If behavior changes what agents see, can do, observe, decide, or auto-load, the source module introducing it must be visible in wiring, named, typed, ordered, and removable.

</architecture>

<code-policy>

## Code Policy

### TypeScript And Effect

- Keep public fallible boundaries as `Effect` where composition, interception, or typed failure matters.
- Prefer Effect-style namespace APIs for public primitive surfaces. Names should read well under their namespace, such as `Tool.Error<Input, Output, Error, Requirements>`, `Tool.Def<Input, Output, Error, Requirements>`, or `Mission.Id`.
- Keep generic parameter order stable for related public types. For tool-like APIs, prefer input, output, error, requirements: `<Input, Output, Error, Requirements>`.
- Prefer plain interfaces and named function fields over class hierarchies or hidden registries.
- Keep runtime data serializable when it crosses process, tool, dispatch, RPC, or persistence boundaries.
- Prefer explicit required internal data over optional/default soup. Normalize optional input once at the boundary.
- Validate external input at the edge and normalize it into explicit internal types. Inside controlled code, fail early and loudly on impossible states.
- Avoid booleans by default for domain state. Prefer discriminated unions or explicit state-machine modules/services.
- Prefer strict discriminated unions for domain states, protocol packets, outcomes, and lifecycle phases.
- Match closed discriminated unions exhaustively. Prefer `Match`/exhaustive matching or `switch` with a `never` check over if/else return ladders. Do not rely on fallback defaults for known protocol states.
- Use named constructors for repeated or exported protocol variants so `_tag` literals and defaults live next to the schema/type definition.
- Keep plain object literals for local throwaway data. Avoid `as const` at public protocol call sites when a typed constructor would make intent clearer.
- Inject providers and backends that may change. Core primitives must not hard-code model vendors, MCP frameworks, or storage providers.
- Constructors/builders should shape values, not perform I/O, allocate runtime resources, read config, call providers, or start fibers.
- Runtime services, clocks, random/id generation, stores, language models, and mutable context should be read from the Effect environment at execution time.
- Do not let raw `Record<string, unknown>` flow past ingress or opaque passthrough boundaries; decode it into schemas or explicit extension points.
- Keep provider-specific shapes out of core/domain types unless deliberately promoted into a shared contract.
- Translate once at each boundary. Avoid repeated half-normalization across layers.
- IDs crossing package, persistence, tool, RPC, dispatch, or mission boundaries should be branded/schema-backed, not raw `string`.
- If ordering matters, encode it in the API. Do not rely on incidental object key order, registration order, import order, or array order.
- Logs, capsules, dispatch events, protocol events, and telemetry are append-only unless an explicit compaction/snapshot boundary says otherwise.

### Module Shape

- Prefer small named modules/services over god files, miscellaneous bags, and `utils.ts`/`helpers.ts`/`common.ts`.
- Split files when they mix protocol/type definitions, service tags, service implementations, command routing, persistence, serialization, and test helpers.
- Keep barrels thin. A package or primitive `index.ts` should mostly export public surface; move runtime behavior into named modules.
- Avoid speculative abstractions. Add an abstraction only for a real boundary, an important domain concept, or repeated use.
- Do not keep aliases, compatibility exports, or parallel old/new paths unless the user explicitly asks for back compatibility.

### Tests And Errors

- New runtime behavior needs focused tests near the package that owns it.
- Runtime behavior owners should be tested in isolation by cutting the Effect graph with fake layers/services. Do not add broad runtime/server/web E2E tests without explicit user confirmation or an explicit wiring-proof request.
- Missing tests are review findings, not TODO decorations. Either add the test, explicitly defer it in the final report, or explain why the surface is type-only.
- Distinguish expected domain failures from defects. Expected failures should be typed and recoverable.
- Recovery is for expected uncertainty at external boundaries: user input, network, filesystem, subprocesses, model providers, persistence, and environment.
- Defects are program bugs or violated internal contracts; do not hide them behind generic error bags, default branches, silent drops, or best-effort recovery.

## Compatibility Modes

- Authorized refactors/replacements may remove obsolete files, aliases, shims, re-exports, comments, and parallel paths.
- Cleanup/audit work must not break compatibility or public behavior without confirmation. Remove only proven non-behavioral leftovers.
- If the user says `back-compat: required`, preserve compatibility and ask for consumers, scope, and removal deadline when unclear.

</code-policy>

<docs>

## Documentation

`docs/` is an Obsidian vault, not a generated docs site.

- Use `docs-reading` before coding or reviewing work where docs define package boundaries, runtime concepts, primitive doctrine, or product vocabulary.
- Use `docs-management` for note moves, splits, archive handling, status changes, and navigation updates.
- Use relative Markdown links, not Obsidian wikilinks.
- Current truth belongs in `docs/direction`, `docs/primitives`, `docs/runtime`, and `docs/clients`.
- Unadopted drafts and research POCs belong in `docs/drafts`.
- Loose speculative ideas belong in `docs/brainstorms`.
- Superseded designs belong in `docs/archive`.
- Adopted or active rationale that does not fit a concept note belongs in `docs/design-notes`.

</docs>

<skills>

## Skill Use

Before starting work, check whether a repo-local skill under `.agents/skills/` applies. Load only the relevant `SKILL.md` files.

Do not maintain a full skill registry in this file. The filesystem is the source of truth for available repo skills.

Use `agent-self-check` before finishing code changes, after deterministic check failures, or when deciding whether a repeated mistake should become a rule.

Use `code-review` when reviewing code changes for defects, regressions, missing tests, weak modeling, package-boundary risks, or stale agent leftovers.

Use `cleanup-audit` after substantial edits, refactors, moves, generated changes, or long agent sessions to remove confirmed non-behavioral leftovers and report possible stale compatibility/runtime paths before changing them.

</skills>

<generated-files>

## Generated Files

- Treat `dist/`, build output, lockfiles, and generated artifacts as derived unless the package explicitly treats them as source.
- Edit source files first.
- Regenerate derived files only through package scripts or documented build commands.
- Do not hand-edit generated output unless the user explicitly asks for a surgical generated-file patch.

</generated-files>

<glossary>

## Review Labels

- **P0** — Must address before proceeding. Blocks current process.
- **P1** — Should address. Strong preference.
- **P2** — Worth addressing. Non-blocking.
- **P3** — Informational.
- **C0** — Certain. Verified or trivially provable.
- **C1** — High confidence. Very likely correct based on context.
- **C2** — Moderate confidence. Reasonable inference; should verify.
- **C3** — Low confidence. Speculative; flag for discussion.

</glossary>

<hard-rules>

## Hard Rules

- American English only in prose, identifiers, comments, and artifacts unless preserving external API names, translations, proper nouns, or jurisdiction-specific terms.
- Never invent scripts, imports, package names, or exports.
- Do not edit generated `dist/` files unless the task explicitly asks for generated output.
- Do not revert user changes unless explicitly instructed.
- Prefer `file.llm.ext` over `file.ext` when both exist.

</hard-rules>
