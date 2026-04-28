---
status: brainstorm
owner: brainstorms
kind: brainstorm
updated: 2026-04-28
---

# Theseus as an outcome execution layer

Status: brainstorm note, not a design spec.

Date: 2026-04-25

## Starting point

The real unit of value is not a Jira ticket, PR, review, deploy, or release
note.

The real unit of value is the outcome.

Example:

```text
Fix the bug that prevents users from paying us money.
```

Everything else is infrastructure around that outcome:

```text
Jira ticket
docs
Slack thread
branch
PR
review
CI
deploy
release note
status update
follow-up task
```

Those artifacts are often necessary. They provide coordination, audit, safety,
communication, permissions, and organizational memory.

But they are not the work itself.

They are the cost of safely getting the work done.

## What Theseus is not

Theseus should not try to replace existing systems of record.

Do not build:

```text
our own Jira
our own Confluence
our own GitHub
our own Slack
our own deployment platform
```

That is not realistic within reasonable resources, and it is not the point.

Those systems already own:

- permissions
- workflows
- org adoption
- audit history
- notifications
- integrations
- compliance expectations

Theseus should use them.

## What Theseus is

Theseus is an outcome execution layer over existing systems.

Rough phrasing:

```text
Theseus turns outcomes into coordinated work across existing tools.
```

Or:

```text
Theseus reduces the coordination cost of getting real outcomes shipped.
```

The system should keep the actual outcome coherent while reading from and
writing to the tools an organization already uses.

## The problem

Work is fragmented across domains:

```text
task tracker
docs
chat
code
PRs
reviews
CI
deployments
release notes
follow-up tasks
```

Every jump loses context and coherence.

Humans manually carry:

- why we are doing this
- what matters
- what changed
- what was decided
- what evidence exists
- what still needs to happen
- what to tell other people

This is expensive.

For small work, the coordination overhead can be larger than the actual fix.

Example:

```text
read vague Jira ticket
open linked Confluence doc
search Slack for clarification
find repo area
make 5-line fix
write PR description
wait for CI
respond to review
update Jira
write release note
tell stakeholder
```

The value was the bug fix and validation. The rest was necessary coordination
tax.

No structure is worse. But current structure is not optimal.

## Existing systems remain systems of record

Jira remains Jira.

But Theseus can:

```text
read tickets
understand them
validate them
detect missing acceptance criteria
detect contradiction with linked docs
summarize what matters
ask clarifying questions
suggest corrections
write comments
update status
link artifacts
reject or flag poorly planned work
turn a ticket into a mission
```

Confluence / Notion / Obsidian remain docs.

But Theseus can:

```text
find relevant pages
extract useful context
notice stale docs
compare docs to ticket requirements
cite sources
turn messy pages into a research packet
```

GitHub remains GitHub.

But Theseus can:

```text
create branches and PRs
read reviews
connect PR changes back to the mission goal
validate implementation against original intent
draft review responses
track CI and deployment status
```

Slack remains Slack.

But Theseus can:

```text
read relevant threads
extract decisions
draft updates
post with approval
detect stakeholder changes
```

## Outcome-centered missions

A mission is a durable attempt to produce an outcome.

Not:

```text
a chat
a Jira ticket
a PR
a project management board
```

But:

```text
an outcome thread across tools and time
```

Example:

```text
Outcome:
  users can pay with wallet checkout again

Necessary infrastructure:
  Jira PAY-482
  analytics doc
  Slack clarification thread
  branch fix-wallet-checkout
  PR #184
  CI run #9912
  deploy prod-2026-04-25
  Slack update
```

The mission owns the coherence.

The external artifacts are attached to the mission.

## Artifacts as projections

Theseus should treat process artifacts as projections of mission state, not as
the mission itself.

Examples:

```text
Jira comment = projection of current mission state
PR description = projection of implementation evidence
release note = projection of shipped outcome
Slack update = projection for stakeholders
follow-up task = projection of unresolved work
```

This means Theseus can check whether an artifact still matches the outcome.

Questions Theseus should ask:

```text
Does this ticket describe the actual outcome?
Does this doc contradict the ticket?
Does the PR still match the mission after review changes?
Do release notes reflect what actually shipped?
Is the Slack update safe to send?
Is there a missing follow-up task?
```

## Mission intake

A mission can start from a messy external record.

Example:

```text
start mission from PAY-482
```

Theseus should not blindly execute the ticket.

It should first triage:

```text
read Jira ticket
read linked docs
inspect related Slack threads if provided
check if the task is actionable
identify missing information
compare acceptance criteria to product/analytics context
produce mission brief
```

Possible result:

```text
This ticket is not ready:
- acceptance criteria do not mention wallet payments
- linked analytics page says the issue is wallet-specific
- no dashboard owner is named
- implementation area is likely checkout/payment events

Suggested Jira comment:
...
```

Or:

```text
This ticket is ready enough.
Mission brief created.

Relevant sources:
- Jira PAY-482
- Analytics doc "Checkout Funnel Events"
- Slack thread from Apr 22

Open risks:
- event name must stay backward-compatible

Next action:
- inspect current analytics event emitter
```

The system should not just execute bad tasks faster. It should detect bad tasks.

## User experience frame

User should not have to start by opening Jira and manually reading tickets.

They should be able to sit down in Theseus and ask:

```text
what am I working on?
what is blocked?
continue this mission
what changed since yesterday?
start mission from this ticket
prepare implementation
respond to review
ship it
explain this to the team
```

Theseus should understand those commands against the mission, not against a
blank chat.

## Connectors are not the center

Do not build one chat agent per app.

That recreates fragmentation.

Better:

```text
one mission
many sources
many actions
one coherent thread
```

Connectors should mostly be sources and actions:

```text
Jira connector:
  read ticket
  comment
  update fields
  transition status

GitHub connector:
  read PR
  inspect checks
  comment
  create branch

Slack connector:
  read thread
  draft/send update

Docs connector:
  fetch page
  extract relevant sections
```

Theseus owns cross-domain continuity.

## Useful distinction

Work tools are not the work.

They are coordination infrastructure.

Theseus should optimize coordination overhead while preserving the safety and
structure those tools provide.

## Relation to Cortex

This note is not primarily about Cortex.

Cortex is context projection / management for model invocations.

This note is about the larger Theseus layer:

```text
outcome
mission
artifacts
connectors
agents
human approvals
external systems of record
```

Cortex may support this by giving each agent/phase the right context, but Cortex
is not the center of this product frame.

Possible stack:

```text
Theseus mission / outcome runtime
  coordinates work across domains

Cortex
  projects context for one invocation

Dispatch
  executes model/tool loops

Satellites
  observe/intervene around execution

Connectors
  read/write external systems
```

## Open questions

- What is the minimal mission shape?
- Is "mission" the right user-facing word?
- How does Theseus decide a ticket is not ready?
- What actions require approval by default?
- How should Theseus represent outcome vs artifact?
- How should Theseus handle conflict between Jira, docs, Slack, and code?
- What does mission completion mean?
- How do follow-up tasks get created without becoming noise?
- How does Theseus avoid becoming another project management app?
- What is the first end-to-end workflow to prove this?
