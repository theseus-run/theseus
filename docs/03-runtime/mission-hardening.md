# Mission Hardening

Mission hardening is the phase that turns messy human intent into something Theseus can safely act on.

The user usually enters Icarus with a problem, not a clean mission dispatch. The problem may be vague, emotional, too broad, missing context, based on a wrong theory, or too risky for unsupervised action. Existing harnesses mostly collapse this distinction: the first prompt becomes the work. That is convenient for trivial tasks, but brittle for serious work.

Theseus should separate raw intent from dispatchable mission.

## Core Principle

Ceremony should scale with risk, ambiguity, and autonomy.

A typo fix should not need a mission brief. A production billing incident should not start from "fix checkout" with no clarification. Theseus should move quickly when the request is bounded, but resist launching poorly defined autonomous work.

Mission hardening is not a required form. It is runtime behavior.

## Raw Intent

Raw intent is what the user naturally brings into Icarus:

- "Users cannot pay us money."
- "Fix the broken import in the test."
- "Implement team-level budgets."
- "This Jira ticket is assigned to me, handle it."

These should all be acceptable starting points. The user should not need to know whether they are starting a chat, a quick task, a scout, or a durable mission.

The system's first job is to determine how much structure is needed before action.

## Pre-Mission Phase

Before dispatch, Theseus may enter a pre-mission phase.

This phase is conversational, not ceremonial. Its purpose is to reduce ambiguity enough to choose the right operating posture.

During pre-mission, Theseus may:

- infer the likely objective
- identify missing context
- inspect linked sources if authorized
- ask targeted clarification questions
- suggest a safer starting posture
- build a draft mission brief in the background
- identify authority boundaries
- distinguish discovery from implementation
- warn when the request is not actionable

The user should not feel forced into filling out a mission template. Theseus should ask the smallest useful question.

Bad behavior:

> Mission difficulty: high. Please fill objective, constraints, success criteria, authority, and risk profile.

Better behavior:

> I can start by narrowing this. Is this a production incident, a Jira ticket, or a local bug you reproduced?

## Operating Posture

Instead of exposing "mission difficulty assessment" as the product concept, Theseus should reason in terms of operating posture.

Posture describes how the runtime is allowed to behave for the current request. The exact UI labels are not part of this note, but the conceptual gradient is:

- conversational help
- quick bounded action
- investigation / scout
- planning
- implementation
- autonomous execution

The user can steer posture explicitly. The runtime can also recommend or resist posture based on risk, ambiguity, and authority.

Example:

> Delete old customer invoices from production.

This should not run as a low-ceremony quick action. Theseus can offer investigation, planning, or an approval-gated mission instead.

## Hardening Output

When enough structure exists, raw intent becomes dispatchable.

A hardened mission does not need infinite detail. It needs enough detail for the chosen posture.

For serious missions, the hardened form should include:

- objective
- intent / background
- success criteria
- scope
- constraints
- authority
- known context sources
- assumptions
- unknowns
- escalation policy
- expected artifacts

For small tasks, the hardened form may be implicit:

> Objective: fix typo in one file. Authority: edit that file. Success: typo corrected.

The runtime does not need to expose this unless doing so helps the user.

## Mission Quality

A mission is ready when Theseus can answer:

- What outcome am I trying to produce?
- How will I know it is done?
- What am I allowed to change?
- What must I avoid?
- What evidence should I return?
- When should I stop and ask?

If these cannot be answered, dispatch should be delayed, downgraded to investigation, or blocked.

## Discovery Is Valid Work

A mission does not always mean implementation.

When the problem is too vague, Theseus should often propose a discovery mission:

> I cannot safely implement this yet, but I can investigate the affected systems and return an implementation brief.

This prevents the agent from inventing product requirements or making broad code changes from weak input.

Discovery missions should produce artifacts such as:

- findings
- affected systems
- evidence
- open questions
- recommended next mission
- risks
- proposed success criteria

## Readiness Bypass

Users must be able to bypass ceremony for simple work.

Theseus should support direct instruction such as:

- "just do it"
- "no mission, quick fix"
- "answer only"

When bypass happens, the system should comply if the action is low-risk or already within available authority. For non-trivial risk, it should either ask for explicit authority or downgrade the action.

Bypass should be auditable, not obstructive.

The trace can record:

- readiness bypassed
- original instruction
- inferred scope
- assumptions
- resulting actions

## Authority Boundary

Mission hardening must clarify authority before action.

Authority answers:

- Can Theseus edit files?
- Can it run tests?
- Can it install dependencies?
- Can it call external systems?
- Can it create tickets or PRs?
- Can it touch production data?
- Can it deploy?
- Can it delegate to subagents?
- Can it continue without supervision?

When Theseus encounters work outside authority, it should stop, report, and request expanded authority or offer a safer alternative.

## Mission Amendment

The mission may change after investigation.

The original user theory may be wrong. For example:

> Fix frontend checkout validation.

Investigation may show the frontend is correct and the backend VAT handler is broken.

Theseus should not silently switch missions. It should preserve intent and amend the mission audibly:

> The stated implementation target appears wrong. The underlying intent is to restore checkout. Evidence points to backend VAT handling. Continue with revised objective?

This keeps autonomy aligned with the user's actual goal rather than the first phrasing.

## Design Boundary

Mission hardening is not project management.

It should not attempt to model every workflow, department, ceremony, or enterprise process. Its job is narrower:

> Convert raw user intent into an actionable, appropriately scoped dispatch for the runtime.

External systems like Jira, GitHub, Slack, Confluence, and Notion may provide context or receive artifacts, but they are not the mission itself.

## Why This Matters

The failure mode of current harnesses is not that they lack prompts. It is that they treat prompts as sufficient units of work.

Theseus should treat prompts as raw material.

A good mission preserves intent across time, context loss, subagent delegation, partial autonomy, and final reporting. Mission hardening is the phase that makes this possible.
