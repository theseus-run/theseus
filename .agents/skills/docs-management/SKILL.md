---
name: docs-management
description: Use when editing the Theseus docs Obsidian vault under docs/, including adding, moving, splitting, renaming, archiving, cross-linking, or restructuring notes and section indexes.
---

# Theseus Docs Management Skill

You are editing the **Theseus** documentation vault. Apply these rules whenever you add,
move, split, or revise notes under `docs/`.

---

## What `docs/` is

`docs/` is an **Obsidian vault**, not a generated docs site.

Optimize for:
- durable design memory
- clear concept boundaries
- easy note discovery
- stable internal links

Do not treat the folder as a dumping ground for long markdown files.

---

## Vault structure

```text
docs/
  README.md
  01-direction/
  02-primitives/
  03-runtime/
  04-clients/
  90-archive/
  99-design-notes/
```

### Section intent

| Folder | Use for |
|---|---|
| `01-direction/` | product intent, goals, constraints, north star |
| `02-primitives/` | publishable core abstractions and tool-system design |
| `03-runtime/` | runtime composition, mission model, crew, architecture |
| `04-clients/` | interface/client notes such as Icarus |
| `90-archive/` | superseded designs kept for archaeology |
| `99-design-notes/` | dated notes, decision records, external-trigger analyses |

When unsure, prefer the most specific active section. Use `90-archive/` only for superseded material.

---

## Core rules

### 1. One note, one concept

Prefer a single durable concept per note.

Good:
- `tool.md`
- `mission-system.md`
- `persistent-runtime.md`

Bad:
- one giant file with multiple unrelated decisions
- appending new doctrine to an old research dump

If a note grows into multiple concepts, split it.

### 2. Stable doctrine vs dated reasoning

Put **stable design truth** in the concept note.

Put **time-bound reasoning** in `99-design-notes/`.

Examples:
- `02-primitives/tool.md` = canonical Tool primitive doctrine
- `99-design-notes/...` = why a decision changed on a specific date

Do not bury the current design inside a dated note.

### 3. Use wikilinks for stable concepts

Inside the vault, prefer Obsidian wikilinks:

```md
[[tool]]
[[architecture]]
[[mission-system]]
```

Use inline code formatting for file paths and code identifiers:

```md
`docs/02-primitives/tool.md`
`Tool.policy.interaction`
```

### 4. Move superseded docs, do not delete by default

If a note is no longer active but still has design value, move it to `90-archive/` and mark it clearly.

Preferred banner:

```md
> Status: SUPERSEDED — see [[tool]]
```

### 5. Keep section indexes current

If you add, move, rename, or archive a note, update the relevant:
- `docs/README.md`
- section `README.md`

The vault map must stay navigable.

---

## Naming rules

- Use short, concrete kebab-case filenames
- Prefer concept names over implementation-task names
- Rename vague names when a clearer concept exists

Good:
- `tool.md`
- `mission-system.md`
- `icarus-cli-plan.md`

Bad:
- `thoughts.md`
- `new-ideas.md`
- `tool-stuff.md`

For design notes, keep an ordered numeric prefix:

```text
99-design-notes/001-thinking-telemetry-satellite.md
```

---

## Status markers

Use short explicit status lines near the top when helpful:

```md
> Status: draft
> Last updated: 2026-04-18
```

Suggested statuses:
- `draft`
- `locked`
- `superseded`
- `archive`

Do not add status boilerplate to every note if it adds no value.

---

## Writing rules

### Do

- lead with the concept and why it exists
- keep the current decision easy to find
- use short sections with explicit headings
- keep examples tight and real
- link companion notes
- preserve design history when it helps future reasoning

### Do not

- mix current doctrine with abandoned approaches without labeling the difference
- leave moved-note references broken
- create parallel notes that say the same thing
- overfit docs to the current implementation if the note is meant to define the primitive

---

## Workflows

### Adding a new concept note

1. Choose the right section.
2. Create one focused note with a clear filename.
3. Add companion links to related notes.
4. Update the section `README.md`.
5. Update `docs/README.md` if the note changes top-level navigation.

### Revising an existing concept

1. Read the note and linked companions first.
2. Preserve the note's role: concept, runtime, archive, or design-note.
3. Make the smallest change that keeps the current design clear.
4. If the revision represents a major decision shift, add or update a `99-design-notes/` entry.

### Moving or renaming a note

1. Move it to the correct section.
2. Update all obvious references and wikilinks.
3. Update section indexes and `docs/README.md`.
4. If the move reflects supersession, add a superseded banner or archive context.

### Splitting a bloated note

1. Identify the enduring concepts hidden inside it.
2. Create one note per concept.
3. Reduce the original note to a map, summary, or archive note.
4. Cross-link the new notes.

---

## Theseus-specific guidance

### Primitive docs

Primitive notes should describe the **design contract**, not every implementation detail.

For example, `02-primitives/tool.md` should center:
- what a Tool is
- what fields are part of the primitive
- what `policy.interaction` means
- what belongs on the primitive vs higher layers

Implementation-specific examples can live in companion notes.

### Tool docs

Keep these distinct:
- `tool.md` — canonical Tool primitive
- `tools.md` — example tool set and catalog
- `tool-composition.md` — how tools are assembled into toolkits/toolsets
- `tool-backends.md` — backend technology choices

Do not collapse these into one mega-note.

### Runtime docs

Keep these distinct:
- `architecture.md` — broad runtime shape
- `mission-system.md` — mission/session model
- `crew.md` — roster, roles, ownership
- `persistent-runtime.md` — daemon/headless runtime model

If two runtime notes overlap, tighten their boundaries rather than merging by default.

---

## Definition of done

A docs change is complete when:

- the note lives in the right section
- the filename matches the concept
- obvious links are updated
- section indexes still reflect reality
- the current design is easier to find than before

If the vault gets more confusing after your edit, the change is not done.
