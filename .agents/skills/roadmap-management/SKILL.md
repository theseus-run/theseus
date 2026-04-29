---
name: roadmap-management
description: Use when creating, updating, reviewing, or promoting Theseus roadmap items, including public roadmap notes, internal roadmap status maps, planning lanes, GitHub issue readiness, and OSS roadmap hygiene.
---

# Theseus Roadmap Management

Use this skill when roadmap or planning work changes what Theseus says it is
building next.

Roadmap work is status management, not aspiration capture. Keep current truth,
planned work, research, and rejected paths separate.

## Read Order

Start with:

1. `docs/direction/roadmap.md`
2. `docs/maps/roadmap-status-map.md`
3. `docs/maps/runtime-truth-map.md`
4. `docs/maps/not-real-yet.md`
5. the owning concept note for the roadmap item

If an item concerns implementation, verify against source before marking it
`shipped`, `active`, or `next`.

## Roadmap Artifacts

- `docs/direction/roadmap.md`: concise public-facing roadmap.
- `docs/maps/roadmap-status-map.md`: internal evidence table and promotion state.
- GitHub issues: execution units only after the item is actionable.
- GitHub milestones/projects: sequencing containers, not doctrine.

Do not put loose ideation in the roadmap. Move it to `docs/brainstorms` or
`docs/drafts` first.

## Status Vocabulary

Use one status per item:

- `shipped`: implemented and verified.
- `active`: currently being built.
- `next`: intended soon and clear enough to plan.
- `designed`: accepted direction, not scheduled.
- `research`: needs investigation, prototype, or decision.
- `blocked`: dependency or unresolved decision is known.
- `parked`: not rejected, but not worth attention now.
- `rejected`: deliberately not doing.

Avoid `future`. It hides whether an item is designed, research, blocked, or
parked.

## Promotion Pipeline

```text
brainstorm -> draft -> designed -> next -> active -> shipped
```

Promotion rules:

- Do not promote directly from brainstorm to active.
- Do not mark `next` without a `done when` test.
- Do not mark `active` without an owner and evidence that work has started.
- Do not mark `shipped` unless code, tests/checks, and docs agree.
- When promoting or demoting, update `roadmap-status-map.md` in the same pass.

## Item Shape

Every roadmap-ready item needs:

- status
- owner
- source docs
- evidence or current implementation note
- dependency or blocker, if any
- `done when` criteria

If `done when` cannot be written, the item belongs in `research`, `drafts`, or
`brainstorms`, not `next`.

## OSS Posture

For public docs:

- Prefer `Now / Next / Later / Not Planned` over dates.
- Publish less than the internal status map knows.
- State non-promises explicitly.
- Do not imply timelines unless the project intends to carry timeline pressure.
- Keep roadmap items tied to user-visible or contributor-visible value.

## Verification

After roadmap doc edits, run:

```sh
bun run docs:check
```

Use `docs-management` rules for links, frontmatter, folder placement, and
status separation.
