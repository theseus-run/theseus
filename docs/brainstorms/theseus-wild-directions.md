---
status: brainstorm
owner: brainstorms
kind: brainstorm
updated: 2026-04-28
---

# Theseus Wild Directions

> Status: brainstorm
> Date: 2026-04-27

This note is intentionally speculative. It collects product and architecture
images that may later become real design notes, prototypes, or discarded ideas.

## What If Theseus Borrowed Just Enough From Games?

What if the useful metaphor was not "agent chat", but "prepare units, equip
loadouts, send them on missions, inspect what happened"?

Do not import game terminology into core doctrine. The value is the operating
image:

```txt
unit        -> actor / work node / dispatchable specialist
mission     -> bounded objective
loadout     -> skills, tools, policies, satellites, model, Cortex policy
recorder    -> Capsule
debugger    -> Icarus
```

Imagine:

```txt
Mission     = the objective
WorkNodes   = running or historical units of work
Systems     = runtime behavior
Cortex      = what is loaded into working memory
Satellites  = instincts, guards, and reflexes
Capsule     = black box recorder
Icarus      = observer/debugger UI
```

Then we could pause, inspect, fork, replay, and debug agent work like a
simulation without making the product feel like a game.

## What If Cortex Was A Save/Load System?

What if context was not a transcript but the current save state?

Imagine every model call having the practical equivalent of:

```txt
known map
available tools
mission log
active rules
active policies/traits
recent events
archived lore
```

Then Cortex is not "summarize chat." Cortex is the loader that decides what is
in memory for this turn.

When context changes, Icarus could show:

```txt
+ loaded Effect v4 procedure card
+ pinned mission criteria
- unloaded stale file read
~ folded shell log into receipt
+ injected operator warning
```

## What If Satellites Were Traits?

What if a Satellite could be a trait, guard, or instinct instead of only policy
middleware?

Imagine assembling a dispatch loadout:

```txt
RiskOfficerSatellite
SkepticSatellite
ArchivistSatellite
SpeedDemonSatellite
PragmatismSatellite
VolitionSatellite
```

Then different mission postures are not prompt soup. They are explicit runtime
assembly.

Example:

```txt
incident mission  -> RiskOfficer + Archivist + ProtocolGuard
prototype mission -> SpeedDemon + Pragmatism
refactor mission  -> Skeptic + TestGuardian + CleanupAudit
```

The wild version: a `SelfDoubtSatellite` sometimes injects a challenge before a
model call:

```txt
Wait. Are we solving the right problem, or only the easiest visible one?
```

## What If Every Model Call Had A Context Diff?

What if Theseus could answer why this turn is different from the previous one?

Imagine Icarus showing:

```txt
Context diff for model call 14

+ AGENTS.md root instruction
+ runtime-engine procedure card
- stale read of packages/theseus-runtime/src/runtime/types.ts
~ folded 42k shell output into recall receipt shell_91
+ SelfDoubtSatellite injected challenge
```

Then context drift becomes visible instead of mysterious.

## What If Agent Runs Had Time Travel?

What if a mission could be replayed to any model call?

Imagine:

```txt
turn 7:
  model saw this frame
  Cortex omitted these stale items
  Satellite injected this warning
  model chose this tool call
  tool returned this result
```

Then the operator can fork from turn 7 with a different model, different
Satellite ring, or different Cortex policy.

This is Redux DevTools for agent missions.

## What If Branches Were Context Universes?

What if a branch did not only change work, but also context policy?

Imagine three branches:

```txt
branch A: aggressive compaction
branch B: full evidence retained
branch C: stronger review model + SkepticSatellite
```

Then Theseus can compare not only code outcomes, but epistemic conditions.

## What If Mission State Was CRDT-Like?

What if background agents did not mutate one shared plan?

Each work node could emit local facts:

```txt
claims
evidence
artifacts
blockers
proposed decisions
```

Runtime merges them into mission state with explicit conflicts.

Then async agents can work concurrently without one shared scratchpad becoming
the truth by accident.

## What If Capsule Was An Aircraft Black Box?

What if Capsule was treated like a mission recorder, not a summary file?

Imagine Capsule preserving:

```txt
mission intent
authority grants
context frame hashes
model/provider choices
tool calls
sandbox posture
operator interventions
satellite interventions
final artifacts
```

Not every raw byte. Enough references, hashes, and artifacts to reconstruct
what mattered.

## What If Icarus Had A Context Health Dashboard?

What if token count was only one health signal?

Imagine:

```txt
context risk: medium
stale evidence: high
active instructions: 14
conflicting instructions: 1
folded evidence groups: 38
recall coverage: 100%
recent tool failures: 5
unresolved blockers: 2
```

Then the operator can understand why a mission feels unstable before it fails.

## What If Theseus Had Agent Linting?

What if every model call had a context linter?

It could flag:

```txt
conflicting instructions
stale file reads
tool result without recall
missing mission criteria
unbounded authority
too many active skills
duplicate policy
```

The linter could be a Cortex audit system or a Satellite.

## What If Skills, Policies, Tools, And Satellites Were Loadouts?

What if a dispatchable unit had an explicit loadout?

Example:

```txt
loadout: runtime refactor specialist
  - effect-v4
  - runtime-engine
  - testing-patterns
  - skeptic-review
  - cleanup-audit
  - shell/read/search tools
  - TestGuardianSatellite
  - balanced Cortex policy
```

Each loadout entry could declare:

```txt
cost
authority
required tools
trigger conditions
known risks
version
owner
```

Then skill/tool/policy/Satellite activation becomes visible and steerable
instead of hidden folder magic or prompt soup.

## What If Agents Had Fog Of War?

What if the model could see which parts of the repo are known, stale, summarized,
or unexplored?

Imagine a repo map marked as:

```txt
known fresh
known stale
summarized
unexplored
forbidden
```

This fights hallucinated certainty. The agent can know what it does not know.

## What If Theseus Tracked Claims Separately From Evidence?

What if agents recorded claims as first-class context objects?

Example:

```txt
claim: dispatch restore is broken
evidence: runtime-poc.test.ts fails with RuntimeNotFound
confidence: medium
status: active
```

Claims could later become:

```txt
confirmed
refuted
superseded
archived
```

Then Cortex can keep active hypotheses visible and remove refuted ones.

## What If Theseus Slept After A Mission?

What if Theseus had background consolidation after work ends?

It could propose:

```txt
missing skills
conflicting instructions
repeated agent mistakes
new tests that should exist
context items to pin next time
docs to update
lint rules to add
```

The important rule: sleep produces proposed source changes, not hidden memory.

## What If Mission Posture Was A Runtime Dial?

What if the user chose:

```txt
fast
balanced
rigorous
forensic
```

And that changed real assembly:

```txt
model choice
satellite ring
Cortex policy
tool authority
required ACK
test expectations
Capsule detail
```

Then "be careful" becomes an executable runtime posture, not just prompt text.

## What If Mission Setup Was Compilation?

What if Theseus compiled a mission before running it?

Inputs:

```txt
user request
mission type
AGENTS.md
skills/procedure cards
repo state
authority
tool grants
runtime posture
```

Output:

```txt
dispatch spec
Cortex policy
Satellite ring
tool grants
work tree seed
warnings
```

Then execution starts from a compiled harness shape.

## What If There Was A Deterministic Shadow Agent?

What if a cheap deterministic checker ran beside the model?

It could check:

```txt
used stale evidence
ignored criteria
called write tool before ACK
failed report schema
overstepped authority
```

This is not a second LLM. It is static analysis for agent behavior.

## Candidate Theme

The strongest combined image:

```txt
Theseus lets operators equip units with explicit loadouts, send them on
missions, and debug what happened.
```

That image connects:

- Mission event log
- WorkNode units of work
- Cortex frame renderer
- Satellite traits/guards
- skills, tools, policies, and models as loadout entries
- Capsule black box
- Icarus time travel
- branchable runs
- context diffs

This should stay a design image, not core vocabulary. The core vocabulary
remains Mission, WorkNode, Dispatch, Tool, Capsule, Cortex, Satellite, Runtime,
and Icarus.
