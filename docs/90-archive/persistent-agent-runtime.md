# Persistent Agent Runtime

> Status: SUPERSEDED — see [[architecture]]
> Archived: 2026-04-26

This note preserves the old actor-daemon direction at a summary level. It is
not active runtime doctrine.

The superseded model treated Theseus runtime as a headless daemon supervising a
graph of persistent named agents:

- root supervisor named Theseus
- persistent named agents such as Forge, Atlas, and Critic
- ephemeral child agents
- mailboxes and target-specific steering
- RuntimeBus queue transport as the primary client/runtime boundary
- Satellites and Controllers attached to each live agent
- first-class graph edges such as `supervises`, `spawned`, and `attached_to`

That direction overfit runtime architecture to a fixed crew model. The current
runtime is instead a mission/world host with command, control, query, systems,
sinks, projections, stores, catalogs, and active dispatch handles.

Crew concepts may still return as harness scaffolding. They should not be
treated as the base runtime model unless a future design explicitly promotes
them again.
