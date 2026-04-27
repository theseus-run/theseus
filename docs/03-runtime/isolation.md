# Isolation And Workspaces

> Status: active doctrine
> Last updated: 2026-04-27

Theseus should be isolation-native.

Agent autonomy should not depend mainly on repeated permission prompts,
command allowlists, or prompt-level policy. Those still have a place, but the
stronger design is to put work inside an explicit execution envelope, grant
broad enough tool/model access inside that envelope, and make promotion back to
project truth explicit.

## Two Axes

Do not collapse execution isolation and source-state isolation.

```txt
Sandbox   = execution isolation
Workspace = source-state isolation
```

They solve different problems.

## Sandbox

A Sandbox is the execution envelope for work.

It answers:

```txt
What machine, process space, filesystem root, network, secrets, mounts,
resource limits, and host access can this work touch?
```

Examples:

- host execution
- local container
- local microVM
- cloud sandbox
- test fake

Host execution is allowed, but it is an explicit high-trust sandbox kind. It
must not be the hidden assumption behind tool execution.

A container with a host bind mount is not equivalent to an isolated microVM or
cloud sandbox. Providers must expose enough posture for the runtime, Capsule,
and operator surfaces to distinguish them.

## Workspace

A Workspace is mutable source state inside a Sandbox.

It answers:

```txt
What checkout, branch, patch, diff, dirty state, and merge base does this
work own?
```

Examples:

- current checkout
- git worktree
- shared clone
- copied repository
- generated scratch directory
- test fake

A git worktree is source-state isolation, not security isolation. It prevents
agents from overwriting each other's files, but it does not protect the host
from commands, secrets access, network access, or process escape.

## Composition

A Mission may use one or more Sandboxes. Each Sandbox may contain one or more
Workspaces.

Typical shapes:

```txt
Mission
  Sandbox: isolated local or cloud environment
    Workspace: main mission checkout
    Workspace: subagent A worktree
    Workspace: subagent B worktree
    Workspace: subagent C worktree
```

```txt
Mission
  Sandbox: host execution, high trust
    Workspace: git worktree branch
```

```txt
Mission
  Sandbox: cloud sandbox for main agent
    Workspace: main checkout

  Sandbox: cloud sandbox for subagent A
    Workspace: subagent checkout

  Sandbox: cloud sandbox for subagent B
    Workspace: subagent checkout
```

Subagents normally need separate Workspaces. They only need separate Sandboxes
when execution isolation, resource isolation, secret separation, or independent
lifecycle is required.

## Tool And Model Access

Tools and model calls execute against a Sandbox and usually target a Workspace.

Bad:

```typescript
Shell.run("rm -rf dist")
```

Better:

```typescript
Shell.run({
  sandboxId,
  workspaceId,
  command: "rm -rf dist",
})
```

The tool implementation decides how to run the command for that
Sandbox/Workspace pair:

- host process
- worktree process
- container exec
- microVM exec
- cloud sandbox command
- fake test interpreter

Broad destructive tool access is acceptable only when the Sandbox and Workspace
limit blast radius appropriately. Network access, host mounts, secrets,
publish, merge, push, and release remain separate explicit grants.

## Promotion

Work inside a Sandbox or Workspace does not automatically become project truth.

Promotion is the explicit movement of results across boundaries:

- subagent Workspace to main mission Workspace
- Sandbox Workspace to host branch
- branch to pull request
- pull request to main
- artifact copy to durable storage
- direct host apply

Direct host apply is the dangerous promotion mode. Prefer patch, commit,
branch, pull request, or artifact promotion for high-autonomy work.

## Capsule

Capsule records mission-relevant isolation events and decisions:

- Sandbox kind and provider
- Workspace kind and branch/checkout identity
- tool/model grants
- network posture
- secrets and host mounts
- important destructive operations
- promotion decisions and artifacts

Capsule should not mirror every raw command or low-level RuntimeEvent.
RuntimeEvents can hold the mechanical execution ledger.

## Provider Posture

Do not lock Theseus to a specific sandbox implementation at the primitive or
runtime contract level.

Candidate providers include:

- Docker Sandboxes
- Sandcastle
- Vercel Sandbox
- E2B
- Daytona
- Modal Sandboxes
- local Docker or Podman
- host execution
- test fakes

These are provider candidates, not doctrine. The doctrine is:

- Sandbox is the execution isolation boundary.
- Workspace is the source-state boundary inside a Sandbox.
- Tool/model access is Sandbox/Workspace-relative.
- Promotion is explicit and reviewable.
- Providers are explicit static wiring, not plugins or hidden discovery.

Never make the primitive `DockerSandbox`. Make the concept `Sandbox`, and make
Docker one provider. Never make the primitive `GitWorktree`. Make the concept
`Workspace`, and make git worktree one provider.

## Design Consequence

Runtime code should avoid assuming that "the filesystem" means the user's real
project checkout.

Tool paths, command execution, dispatch events, Capsule entries, test fakes, and
promotion flows should have a place to carry Sandbox and Workspace identity
when behavior crosses into mutable world access.

This does not require implementing every provider now. It does require avoiding
host-workspace assumptions that would make isolation a bolted-on feature later.
