# Theseus — Goals

> Status: locked for now
> Last updated: 2026-04-02

---

## North star

> "I need X done. Go do it."

A mission dispatch system. Named after the ship in *Blindsight* (Peter Watts) —
dispatched on a mission, crewed by specialists, operating autonomously, reporting back.
You don't talk to the engines. You dispatch and await results.

Not a chatbot. Not a conversation. A job system with LLM-powered crew.

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

---

## What stays regardless of model improvements

| Primitive | Why it stays |
|---|---|
| Mission | Humans always need a job tracker with a goal and done criteria |
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
