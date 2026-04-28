---
name: docs-management
description: Use when editing the Theseus docs vault under docs/, including adding, moving, splitting, renaming, archiving, cross-linking, changing doc status, or restructuring section indexes.
---

# Theseus Docs Management

Use this skill whenever you edit `docs/`.

The docs are durable design memory. They must make status obvious: what is
current, what is draft, what is speculative, and what is superseded.

## Folder Contract

```text
docs/
  README.md
  direction/          current product direction
  primitives/         current primitive and protocol doctrine
  runtime/            current runtime architecture and implementation notes
  clients/            current client/operator surface notes
  drafts/             unadopted design drafts, research notes, and POCs
  brainstorms/        loose speculative ideas
  archive/            superseded designs kept for archaeology
  design-notes/       adopted or active rationale that does not fit a concept note
  maps/               navigation maps for humans and coding agents
```

Default placement:

- current truth about implemented or intended architecture: `direction`, `primitives`, `runtime`, `clients`
- useful but unadopted design/research: `drafts`
- deliberately wild or unvalidated ideation: `brainstorms`
- superseded history: `archive`
- adopted time-bound rationale: `design-notes`
- navigation over existing docs: `maps`

Do not leave stray top-level folders under `docs/`.

## Link Policy

Use relative Markdown links, not Obsidian wikilinks.

Good:

```md
[architecture](../runtime/architecture.md)
[tool](tool.md)
```

Bad:

```md
double-bracket link to architecture
double-bracket link to tool
```

After moving files, update obvious links and run a link-resolution check.

## Status Rules

Current notes should say what is true now. Do not mix aspirational behavior into
current implementation notes without labeling it as not implemented.

Use short status banners when they prevent confusion:

```md
> Status: current implementation
> Status: active doctrine
> Status: draft
> Status: brainstorm
> Status: SUPERSEDED — see [architecture](../runtime/architecture.md)
```

If a note moves to `archive`, add or keep a superseded banner.

## Editing Rules

- One durable concept per note.
- Keep active docs accurate against the code.
- Preserve useful history by moving it, not deleting it.
- Split concept truth from reasoning history.
- Keep `docs/README.md` and section `README.md` files current.
- Prefer precise links to companion notes over duplicating large explanations.
- Do not hand-wave with "future"; say `not implemented`, `draft`, or `brainstorm`.

## Accuracy Workflow

1. Read the note and linked companion notes.
2. Read the relevant source files before changing implementation claims.
3. Decide the note status: current, draft, brainstorm, archive, or design note.
4. Move or split the note if its status is wrong for its folder.
5. Rewrite claims so active docs describe real code and durable doctrine.
6. Update section indexes and `docs/README.md`.
7. Verify no wikilinks remain and all relative `.md` links resolve.

Useful checks:

```sh
rg -n "\\[\\[" docs
bun run docs:check
```

## Preservation Rule

Before deleting or heavily reducing a note, verify it has no unique durable
value. Prefer moving to `drafts`, `brainstorms`, or `archive` with a
status banner.
