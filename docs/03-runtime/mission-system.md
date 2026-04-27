# Mission System

Design document for the current Theseus mission system. Evolved from the
original capsule implementation in `cockpit/.theseus/opencode/plugin/` — that
implementation is v0 (OpenCode, compliance-based).

Mission is primitive as a structured work envelope, not because this exact
mission schema is final. The schema below is the current implementation-mission
shape and may evolve into multiple mission types.

---

## Core insight

The original capsule system was correct in concept but had a structural flaw: **authorship**. It asked agents to write to the capsule during work — call `theseus_log`, write events, reference artifacts. This is compliance-based and leaks. Teammates resist because they get ceremony overhead, not immediate value.

The fix: **derive the capsule from the work, don't author it alongside the work**.

The lock ceremony remains. Everything else becomes automatic.

---

## The split: Mission ≠ Session

These two concepts were conflated in v0. They are distinct.

**Mission** = crystallized user intent. Spans time.
- Created explicitly, with human confirmation
- Locked once, with user sign-off on the precise definition
- Immutable after lock — scope changes are deltas, never edits
- Closed when all outputs are met (or explicitly abandoned)
- For implementation missions, may map to a PR: `mission.md` ≈ PR description,
  `artifacts/` ≈ PR diff

**Capsule** = the mission black box. One Mission owns exactly one primary
Capsule. The Capsule is the source of truth for mission-facing summaries,
decisions, evidence, artifacts, handoffs, PR descriptions, release notes, and
future continuation.

Do not create free-floating Capsules or arbitrary sub-capsules. If future side
quests or sub-missions need their own black boxes, they should become
mission-like child work envelopes first; each child may then own its own
Capsule.

**Session** = a work window inside a mission. Time-scoped.
- Auto-opened when an agent starts working under a `missionId`
- Auto-closed when the conversation/session ends
- Summary LLM-generated from session transcript — no agent writes it
- Artifact list derived from filesystem diff — no agent tracks it
- Multiple sessions per mission, across days or weeks

---

## Directory structure

```
.missions/
  {missionId}/
    mission.md            ← written at lock, immutable forever
    mission.jsonl         ← mission-level events only (scope, decide, concern, friction)
    sessions/
      {session-1}/
        summary.md        ← LLM-generated at session close, not authored
        artifacts.md      ← filesystem diff of this session, derived not tracked
      {session-2}/
        ...
    artifacts/            ← all files produced across all sessions
```

`missionId` = slug + date. e.g. `dashboard-lcp-2026-03-17`.

---

## Lifecycle

### Mission lifecycle

```
[open] → [clarifying] → [locked] → [active] → [closed]
                                       ↑            |
                                       └─ [reopen] ←┘
```

Status derived from events, never stored:
```typescript
const status = closed ? "closed"
             : locked ? "active"
             : clarifying ? "clarifying"
             : "open"
```

State transitions:
- `mission.open` → open (Theseus creates the mission record)
- `mission.clarify` → clarifying (Theseus enters discovery conversation)
- `mission.lock` → locked/active (user confirms intent, mission.md written)
- `mission.close` → closed (user confirms outputs met)
- `mission.reopen` → active (closed mission resumed)

### Session lifecycle

```
[auto-open] → [working] → [auto-close] → [summary generated]
```

Sessions have no explicit tool calls. The runtime opens a session when an agent starts work under a `missionId`. The runtime closes it when the conversation ends. Summary and artifact list are derived after close.

Sessions are sub-records of a mission, not independent entities. A session without a mission is just a session — it gets a lightweight auto-record but no mission structure.

## Mission types

The current document mostly describes implementation missions because the first
Theseus wedge is a coding harness. Mission as a primitive is broader.

Possible mission types:

- implementation
- research
- brainstorm
- review
- planning
- incident
- quick task

Mission structure should scale with risk and ambiguity. A quick task can have
implicit scope and criteria. A brainstorm mission can use looser completion
definition. A production incident needs authority, evidence, and escalation
policy.

Do not force every mission type into the implementation-mission lifecycle if
that makes the work worse. Preserve the principle: structured intent over raw
chat.

---

## The lock ceremony — the killer feature

Not the logging. Not the artifacts. **The clarification loop.**

Most agentic failures happen because human intent and agent interpretation diverged before work started. The mission system's unique value is forcing alignment before any code is written.

```
user: "make the dashboard faster"

Theseus clarifies:
  - Faster how? LCP, API latency, or render perf?
  - Which dashboard? Main or admin?
  - What's the current baseline?
  - What does "done" mean — a number, a user test, a gut feel?

user confirms → theseus_mission_lock → mission.md written → IMMUTABLE
```

After lock, the mission definition cannot change. Scope changes are `mission.scope` events — deltas against the locked definition. This means you can always compare what was promised vs what was delivered. Scope creep is visible and documented.

**The lock is the only moment requiring deliberate human action** (beyond the initial request). Everything after is either automatic or orchestrator-only.

---

## Compliance surface

This is what changed fundamentally from v0.

| Action | v0 (OpenCode) | Target model |
|---|---|---|
| Mission start | `theseus_open` tool call | `theseus_mission_open` (Theseus explicit) |
| Session start | Conflated with mission start | Auto — runtime creates session when work begins |
| Artifact tracking | `mission.artifact_write` event per file | Auto — filesystem diff at session close |
| Session summary | Agent writes close summary | Auto — LLM generates from session transcript |
| Friction logging | Agent calls `theseus_log` | Auto — extracted from transcript post-session |
| Mission-level events | Any agent calls `theseus_log` | Orchestrator only (`theseus_mission_log`) |
| Session close | `theseus_close` tool call | Auto — session closes when conversation ends |
| Mission close | `theseus_close` tool call | `theseus_mission_close` (Theseus explicit, after user confirms) |

**What requires deliberate action:**
1. User confirms intent at lock — unavoidable and correct, this *is* the value
2. User confirms outputs met at close — unavoidable, this is the accountability check
3. Theseus logs `mission.scope` / `mission.decide` — orchestrator-only, not subagent compliance

**What subagents do:** nothing. They work. The session records around them.

---

## Event vocabulary

### Mission-level events (written to `mission.jsonl`, Theseus only)

These are semantic events about the mission itself, not about what happened in a session.

| Type | Fields | When |
|---|---|---|
| `mission.open` | `title`, `missionId`, `v` | Theseus creates the mission record |
| `mission.clarify` | `question`, `answer` | During discovery conversation |
| `mission.lock` | `path` (to mission.md) | User confirms intent |
| `mission.scope` | — | Work expands beyond locked outputs — log before proceeding |
| `mission.decide` | — | Non-trivial architectural choice, before acting |
| `mission.concern` | — | Risk or blocker that may affect outcomes |
| `mission.friction` | — | Any of the friction trigger conditions (see below) |
| `mission.close` | `result: "shipped"\|"cancelled"\|"failed"` | User confirms close |
| `mission.reopen` | `reason` | Closed mission resumed |

### Session-level records (auto-generated, not events)

Sessions are not event-streamed. They are written once at session close:

```typescript
type SessionRecord = {
  sessionId: string
  missionId: string
  startedAt: string
  endedAt: string
  summary: string          // LLM-generated from transcript
  filesChanged: string[]   // filesystem diff
  frictionExtracted: string[]  // LLM-extracted friction patterns
  agentsUsed: string[]
}
```

### Friction triggers (mandatory `mission.friction` event)

Theseus logs these; the analysis agent extracts them post-session from transcripts:

- Approach reversal: built X, replaced with Y
- Contradictory conclusions: stated X was correct, later found X was wrong
- Viability failure: shipped something that turned out unviable
- Retry with different strategy: same goal, different approach after first failed
- 3 iterations on the same concern (loop detected)
- 5 total dispatch iterations (scope reassessment needed)
- General agent used: no suitable specialist available

---

## When does a mission open?

**Option A (rejected):** User explicitly says "start a mission." Requires teammates to judge when something is mission-worthy. Back to compliance.

**Option B (chosen):** Sessions are the default. Theseus escalates to a mission when warranted.

```
user starts a session
  ↓
Theseus assesses: is this mission-worthy?
  trivial (single file, < ~10 min) → session-only record, no mission
  meaningful (PR-sized, multi-step) → propose locking a mission
  ↓
if mission proposed:
  Theseus runs clarification loop
  user confirms
  mission locked
  session becomes session-1 of this mission
```

The boundary between "quick thing" and "mission" is Theseus's call, not the teammate's. Teammates never think about missions — they just start working.

---

## The resume experience

This is what drives teammate adoption. When a new session starts under an existing mission:

```
Resuming: "Dashboard LCP optimization" (mission-dashboard-lcp-2026-03-12)
Status: active | Sessions: 2 | Locked: March 12

Goal: Reduce LCP on main dashboard from 4.2s to under 2s
      (95th percentile, measured on production)

Last session (March 14):
  - Traced root cause to blocking analytics script in <head>
  - Moved to async load, LCP dropped to 2.8s
  - Remaining: image optimization pass + lazy-load below fold

Files in play: src/dashboard/index.tsx, public/analytics.js

Continue?
```

No `theseus_read` call. No agent re-orientation. The context is injected automatically because the session knows its `missionId` and the mission record is always current.

---

## Post-session telemetry

After every session close, an analysis pass runs against the session transcript:

```typescript
type SessionAnalysis = {
  approachesReversed: string[]
  loopsDetected: { concern: string; count: number }[]
  scopeExpansions: string[]
  agentsThatFailed: string[]
  planAccuracy: "on-track" | "partial" | "diverged"
  frictionPatterns: string[]
  sessionDurationMin: number
  stepsCompleted: number
  stepsTotal: number
}
```

Written to `sessions/{id}/analysis.json`. No agent involvement. The transcript is the data.

Aggregated weekly across all closed missions → systematic friction patterns in Theseus behavior. This is the improvement feedback loop that doesn't require asking teammates "how did it go?"

---

## Tool surface (target)

| Tool | Owner | Description |
|---|---|---|
| `theseus_mission_open` | Theseus only | Creates mission record, starts clarification |
| `theseus_mission_lock` | Theseus only | Writes `mission.md`, marks mission as locked |
| `theseus_mission_close` | Theseus only | Closes mission with result |
| `theseus_mission_reopen` | Theseus only | Reopens a closed mission |
| `theseus_mission_log` | Theseus only | Appends mission-level event to `mission.jsonl` |
| `theseus_missions_list` | Any agent | Lists missions with status |
| `theseus_mission_read` | Any agent | Reads mission record (definition + session summaries) |

Sessions have no tools. They are auto-managed by the runtime.

Note: subagents (`forge`, `crusher`, etc.) have access to `theseus_mission_read` to read the mission context they're working under. They have no write access. The only write path is through Theseus via `theseus_mission_log`.

---

## Relationship to the Effect runtime

In the Effect runtime, sessions are fiber-scoped:
- Opening a session = creating a `Ref<SessionState>` scoped to the current fiber
- Session context is passed to subagents via Effect's `Context` / Layer injection
- The resume experience = loading `SessionState` from disk into the `Ref` at session start
- Post-session analysis = a cleanup Effect that runs when the session fiber terminates

The `mission.jsonl` audit trail remains — it's the external record, human-readable, independent of the runtime. But in-session, agents don't query it. They use the in-memory `MissionContext` service.

```typescript
class MissionContext extends ServiceMap.Service<MissionContext, {
  readonly mission: MissionRecord
  readonly currentSession: SessionRecord
  readonly brief: AgentBrief           // assembled at dispatch time
}>()("MissionContext") {}
```

The `brief` is assembled per-agent at dispatch time — a targeted summary of what that specific agent needs. Grunts get minimal context. Named agents get their relevant session history. No agent fetches context itself; it arrives with the task.

---

## What this is not

- Not a logging system that agents write to
- Not a compliance protocol that subagents must follow
- Not a replacement for git (the diff is always the source of truth for file changes)
- Not a project management tool (no sprints, no estimates, no status updates)

It is: **crystallized user intent + a structured record of what happened trying to realize it**, generated automatically, readable by humans and machines.

---

## v0 → target delta

| Concept | v0 (OpenCode) | Target |
|---|---|---|
| Unit of work | Capsule (session-scoped) | Mission (structured intent; implementation missions may be PR-scoped) + Session (time-scoped) |
| Session | Implicit (session file hack) | First-class, auto-lifecycle |
| Mission start | `theseus_open` (any time) | Theseus proposes when session is mission-worthy |
| Mission summary | Agent-authored | LLM-generated from transcript |
| Artifact tracking | `mission.artifact_write` events | Filesystem diff at session close |
| Subagent logging | Any agent calls `theseus_log` | Orchestrator-only write path |
| Friction capture | Agent compliance | Post-session transcript analysis |
| Context re-injection | Compaction hook band-aid | In-memory `MissionContext` service, never lost |
| Resume | Agent calls `theseus_read` | Auto-injected at session start |
