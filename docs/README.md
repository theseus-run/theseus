---
status: current
owner: docs
kind: index
updated: 2026-04-28
---

# Theseus Docs

This `docs/` directory is the Theseus Obsidian vault.

## Structure

- `direction/` — product intent, goals, and north star
- `primitives/` — public primitive design and tool-system notes
- `runtime/` — active runtime architecture and mission model
- `clients/` — interface and client plans
- `drafts/` — unadopted design drafts, research notes, and POCs
- `brainstorms/` — loose speculative ideas
- `archive/` — superseded designs kept for archaeology
- `design-notes/` — adopted or active rationale that does not belong in a concept note
- `maps/` — navigation maps for humans and coding agents

## Start Here

- [Direction](direction/README.md)
- [Primitives](primitives/README.md)
- [Runtime](runtime/README.md)
- [Clients](clients/README.md)
- [Drafts](drafts/README.md)
- [Brainstorms](brainstorms/README.md)
- [Archive](archive/README.md)
- [Design Notes](design-notes/README.md)
- [Maps](maps/README.md)

## Conventions

- Prefer one concept per note.
- Use relative Markdown links between notes.
- Current truth belongs in `direction/`, `primitives/`, `runtime/`, and `clients/`; drafts in `drafts/`; loose ideas in `brainstorms/`.
- Move superseded designs to `archive/` instead of deleting them.
- Keep stable doctrine in the concept note; put time-bound reasoning in `design-notes/`.
- Run `bun run docs:check` after docs moves or link edits.
- Use [runtime-truth-map](maps/runtime-truth-map.md) and [not-real-yet](maps/not-real-yet.md) before changing runtime docs.
- Use [roadmap](direction/roadmap.md) and [roadmap-status-map](maps/roadmap-status-map.md) for planning work.
