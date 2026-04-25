# Theseus — Goals

> Status: active direction
> Last updated: 2026-04-25

---

## North star

> "I need X done. Go do it."

Theseus is an outcome execution layer that starts as a coding harness.

The near-term wedge is "opencode, but better": a local-first coding harness with
stronger primitives for missions, audit, artifacts, context, and specialist work.
The longer-term ambition is broader: carry coherence from a desired outcome,
through the existing systems and artifacts needed to ship it.

Named after the ship in *Blindsight* (Peter Watts) — dispatched on a mission,
crewed by specialists, operating autonomously, reporting back. You don't talk to
the engines. You dispatch and await results.

Not a chatbot. Not a conversation. A job system with LLM-powered crew.

The important object is not the chat, Jira ticket, PR, review, deploy, or
release note. Those are coordination infrastructure. The valuable object is the
outcome: the bug fixed, the feature shipped, the incident resolved, the work
completed.

Theseus should use existing systems of record instead of replacing them. Jira,
GitHub, Slack, docs, CI, and deployment systems remain where organizations keep
permissions, workflow, audit, and communication. Theseus reads from them, writes
to them when appropriate, validates them, and links them into a coherent mission.

The goal is to remove hops like:

1. task creator thinks through the work
2. writes a lossy Jira ticket
3. developer reads the ticket and reconstructs intent
4. developer writes a lossy prompt to an agent
5. agent starts from partial context

Instead, Theseus should be able to start a mission from an external work record:
read the ticket, inspect linked docs or threads, validate readiness, surface
missing information, produce a mission brief, and only then dispatch work.

---

## Target architecture

```
Web Client / icarus-cli
  │  HTTP + SSE / WebSocket
  ▼
RuntimeServer  (headless — server or local)
  │  N independent mission fiber trees
  ▼
Mission  (goal + criteria + capsule + crew + workspace)
  │  dispatch
  ▼
Tools / AI calls
```

Not a one-stop binary. Runtime and interface are separate. `icarus-cli` is a POC proving
the runtime is viable. A web interface is the real target — deferred.

---

## Design constraints

**Only irreducible complexity.**
Every primitive must be necessary for a viable mission. If you can remove it and still
have a working system, it is not a primitive.

**Future-proof.**
Design as if a vastly better model (3M context, dramatically improved instruction
following) drops next month. What becomes obsolete that instant is scaffolding.
What remains is a primitive.

**No vendor lock-in.**
No specific LLM, MCP framework, skill format, or tool ecosystem baked into the core.
Providers are injected. Formats are strings or open types. Everything that might change
is behind an interface.

**Best leverage first.**
Build the things everything else can be built on. The five primitives (Mission, Tool,
Capsule, Dispatch, RuntimeBus) are the floor. The harness, the crew, the skill system
are built on top.

**Work products over chat residue.**
Agent work should produce durable, reviewable artifacts: mission briefs,
completion criteria, plans, evidence, decisions, implementation notes, review
responses, release notes, and handoffs. A todo list visible during a run is not
enough if it cannot be reviewed, linked, resumed, or compared against what
shipped.

**Existing tools are sources and sinks.**
Do not rebuild Jira, GitHub, Slack, Confluence, Notion, CI, or deployment
systems. Connect to them. Treat their records as inputs and outputs of missions,
not as the mission itself.

---

## What stays regardless of model improvements

| Primitive | Why it stays |
|---|---|
| Mission | Humans always need a durable attempt to produce an outcome, with goal, criteria, artifacts, evidence, and audit |
| Tool | Models always need typed, controlled world access |
| Capsule | Humans always need voyage logs — to debug, to improve |
| Dispatch | You always need to invoke an AI with context and get a result |
| RuntimeBus | You always need to observe a running job and occasionally intervene |

---

## What is scaffolding (will thin as models improve)

- Verification loops — models will self-verify
- Dedicated planning agents — models will plan inline
- Cycle caps and retry logic — models will fail less
- Skill injection for generic knowledge — model already knows it
- Grunt vs Agent distinction — persistent history becomes cheap

Design these as optional layers on top of the primitives, not as assumptions the
primitives are built around.

---

## What this is not

- Not a chatbot
- Not a one-LLM-per-request system
- Not tied to a fixed agent roster
- Not opinionated about isolation strategy (deferred — WorkspaceContext is opaque)
- Not a one-stop binary
- Not a replacement for existing systems of record

---

## Wedge and ambition

**Wedge:** coding harness.

Start with the domain where there is strong prior art and tight feedback loops:
repo context, tools, edits, tests, PRs, reviews, CI, and release notes. The first
product should be understandable as an opencode/Codex/Claude Code style harness
with stronger mission structure.

**Ambition:** outcome execution.

The same primitives should not dead-end at coding chat. A mission should be able
to originate from a Jira or Linear ticket, a Slack thread, an incident, a doc, or
a direct user request. Theseus should turn that source into a validated mission,
carry the coherent thread through execution, and project the right artifacts
back to the systems of record.

Related research notes:

- [[theseus-outcome-execution-layer]]
