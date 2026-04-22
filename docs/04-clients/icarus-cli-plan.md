# icarus-cli — Implementation Plan

> Status: draft  
> Last updated: 2026-03-18  
> Package: `packages/icarus-cli` (`@theseus.run/icarus-cli`)  
> Constraints: Bun-native, Effect-native, Ink for terminal UI

---

## What Icarus is

`icarus-cli` is the **terminal interface to Theseus**. `theseus-runtime` is a headless
process — no UI code, no terminal assumptions. `icarus-cli` is a separate package that
connects to the runtime via the `RuntimeBus` Effect Service and renders the operator UI
using Ink/React.

Future interfaces (`icarus-web`, iPad app, etc.) connect the same way — via `RuntimeBus`
with a different transport `Live` layer.

```
Operator (terminal)
  │
  ▼
packages/icarus-cli          ← this plan
  │  RuntimeBus (in-process Queue transport today)
  ▼
packages/theseus-runtime     ← headless, unchanged
```

---

## What does NOT change

- All of `theseus-runtime`: `AppLayer`, `AgentRegistry`, `CopilotProvider`, `TsService`, tools, agents, actor model, message types.
- [[architecture]] locked decisions.

Changes inside `theseus-runtime` are minimal and additive:
- Add `RuntimeBus` service definition + `UIEvent` types (exported from runtime, no UI dep)
- Replace `Bun.stdin.stream()` loop with `Queue.take(bus.inputQueue)`
- Replace direct `process.stdout.write` in coordinator `TaskDone` with `Queue.offer(bus.eventQueue, ...)`
- Replace `TuiLoggerLive` stdout writes with `Queue.offer(bus.eventQueue, Log event)`

---

## RuntimeBus — the transport contract

Defined in `@theseus.run/runtime`, implemented by each `icarus-*` package.

```typescript
// packages/theseus-runtime/src/bus.ts (or new runtime-bus.ts)

export type UIEvent =
  | { _tag: "Log";           level: "info"|"warn"|"error"; agent: string; message: string; ts: number }
  | { _tag: "ToolCall";      taskId: string; tool: string; args: string }
  | { _tag: "ToolResult";    taskId: string; tool: string; preview: string }
  | { _tag: "ForgeResponse"; taskId: string; content: string }
  | { _tag: "StatusChange";  status: "idle"|"working" }

export class RuntimeBus extends ServiceMap.Service<RuntimeBus, {
  // runtime → interface: structured events
  eventQueue: Queue.Queue<UIEvent>
  // interface → runtime: user instructions
  inputQueue: Queue.Queue<string>
}>()("RuntimeBus") {}
```

The runtime:
- emits via `Queue.offer(bus.eventQueue, event)` — fire and forget, never blocks
- receives via `Queue.take(bus.inputQueue)` — blocks until a line arrives (replaces stdin loop)

`icarus-cli` provides `InkRuntimeBusLive`, a Layer that allocates both queues,
bridges `eventQueue` to React state, and wires `inputQueue` to `useInput` → Enter.

---

## InkRuntimeBusLive — how the bridge works

```typescript
// packages/icarus-cli/src/bus.ts

export const InkRuntimeBusLive = Layer.effect(RuntimeBus)(
  Effect.gen(function* () {
    const eventQueue = yield* Queue.unbounded<UIEvent>()
    const inputQueue = yield* Queue.unbounded<string>()
    return { eventQueue, inputQueue }
  })
)
```

Two Effect fibers run inside `icarus-cli`:

**Fiber 1 — event drain (Effect → React):**
```typescript
// Drains eventQueue and calls React setState
Effect.gen(function* () {
  const bus = yield* RuntimeBus
  while (true) {
    const event = yield* Queue.take(bus.eventQueue)
    // call inkSetEvents / inkSetStatus — passed in as callbacks
    onEvent(event)
  }
})
```

**Fiber 2 — the full runtime:**
```typescript
BunRuntime.runMain(
  Effect.provide(main, AppLayer.pipe(Layer.provide(InkRuntimeBusLive)))
)
```

**Input (React → Effect):**
```typescript
// In Ink's useInput:
useInput((char, key) => {
  if (key.return && input.trim()) {
    // runFork a Queue.offer into the live runtime
    runtime.runFork(Queue.offer(bus.inputQueue, input.trim()))
    setInput("")
  }
  // ... backspace, ctrl+c ...
})
```

`runtime` here is an `Effect.Runtime` obtained inside the main Effect via `Effect.runtime()`,
then passed to the Ink component via the shared bridge object. This is the one mutable slot:
the runtime handle, set once after the Effect runtime boots, before any user input arrives.

---

## Startup sequence

```
bin/icarus.ts:
  1. Allocate shared bridge = { runtime: null, inputQueue: null }
  2. render(<App bridge={bridge} />)          ← Ink owns terminal from here
  3. BunRuntime.runMain(
       Effect.gen(function* () {
         const rt    = yield* Effect.runtime()   ← live runtime handle
         const bus   = yield* RuntimeBus
         bridge.runtime    = rt                  ← wire Ink → Effect dispatch
         bridge.inputQueue = bus.inputQueue
         yield* main                             ← start coordinator, agents
       }).pipe(Effect.provide(AppLayer.pipe(Layer.provide(InkRuntimeBusLive))))
     )
  4. Drain fiber: rt.runFork(drainEventQueue(onEvent))
```

Steps 3 and 4 start concurrently. Ink renders immediately (step 2); the runtime boots
async. The user cannot submit input before `bridge.runtime` is set because the status bar
shows "starting…" and the input box is disabled until the first `StatusChange { status: "idle" }` event arrives.

---

## Ink component structure

```tsx
// packages/icarus-cli/src/app.tsx

<App>
  <Static items={events}>        // scrollback — append-only, never re-renders old rows
    {(e, i) => <EventRow key={i} event={e} />}
  </Static>
  <Divider />
  <StatusBar status={status} />  // "forge: idle" | "forge: working"
  <Divider />
  <InputLine bridge={bridge} ready={status !== "starting"} />
</App>
```

### `<Static>` — the correct primitive

Ink's `<Static>` renders items into the scrollback buffer permanently. New events push to
`events` array in React state; `<Static>` appends them above the status bar without
re-rendering existing rows. The terminal's own scrollback handles history navigation.

### `<InputLine>` — Bun-native

`useInput` sets `process.stdin` to raw mode, which Bun implements natively. No
Node.js `readline`. Character-by-character accumulation, submit on `key.return`,
clear on submit. `Ctrl+C` calls `useApp().exit()` for clean fiber interruption.

### Event row display

| `UIEvent._tag` | Display |
|---|---|
| `Log` info | `HH:MM:SS.mmm [agent] message` — dimmed |
| `Log` warn | yellow |
| `Log` error | red bold |
| `ToolCall` | `  → tool(args_preview…)` — cyan |
| `ToolResult` | `  ← tool: preview…` — dim |
| `ForgeResponse` | `─── task-001 › forge ───\n{content}\n────` — bold white |
| `StatusChange` | updates status bar only, not logged |

Tool args/result previews are truncated to ~120 chars in the runtime before queuing,
keeping the scrollback readable.

---

## File plan

### New package: `packages/icarus-cli/`

```
packages/icarus-cli/
├── package.json               @theseus.run/icarus-cli; deps: ink, react, @theseus.run/runtime
├── tsconfig.json              extends root; jsx: react-jsx
├── bin/
│   └── icarus.ts              Entry point: render + boot runtime
└── src/
    ├── bus.ts                 InkRuntimeBusLive Layer
    └── app.tsx                <App>, <EventRow>, <StatusBar>, <InputLine>
```

### Changes to `packages/theseus-runtime/`

```
src/
  runtime-bus.ts   NEW — RuntimeBus service class + UIEvent union (exported)
  tui.ts           MODIFY — TuiLoggerLive calls Queue.offer(eventQueue, Log) instead of stdout
  runtime.ts       MODIFY — main reads Queue.take(inputQueue) instead of Bun.stdin.stream()
  agents/
    coordinator.ts MODIFY — TaskDone calls Queue.offer(eventQueue, ForgeResponse + StatusChange)
```

`TuiLoggerLive` now depends on `RuntimeBus`. It requires `RuntimeBus` from the layer
graph; `icarus-cli` provides `InkRuntimeBusLive`; a future `DevConsoleBusLive` for
plain stdout could be provided in tests or non-Ink contexts.

---

## Dependencies

### `packages/icarus-cli/package.json`
```json
{
  "dependencies": {
    "@theseus.run/runtime": "workspace:*",
    "effect": "4.0.0-beta.33",
    "@effect/platform-bun": "4.0.0-beta.33",
    "ink": "^5.1.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/bun": "^1.3.10",
    "typescript": "^5.9.3"
  }
}
```

### `packages/icarus-cli/tsconfig.json`
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

No Ink / React deps in `theseus-runtime`. The runtime stays headless.

---

## Implementation order

1. **`runtime-bus.ts`** in `theseus-runtime` — `RuntimeBus` service + `UIEvent` union; export from `index.ts`
2. **`tui.ts`** — `TuiLoggerLive` offers to `eventQueue` instead of `process.stdout.write`; depends on `RuntimeBus`
3. **`runtime.ts`** — replace stdin loop with `Queue.take(bus.inputQueue)` loop; expose `Effect.runtime()` handle
4. **`coordinator.ts`** — `TaskDone`: offer `ForgeResponse` + `StatusChange("idle")` events
5. **Scaffold `packages/icarus-cli/`** — `package.json`, `tsconfig.json`, dirs
6. **`src/bus.ts`** — `InkRuntimeBusLive` Layer (allocate both queues)
7. **`src/app.tsx`** — `<App>`, `<EventRow>`, `<StatusBar>`, `<InputLine>` with `useInput`
8. **`bin/icarus.ts`** — render + boot sequence; drain fiber
9. **Smoke test** — `bun run packages/icarus-cli/bin/icarus.ts`, type a task, verify scrollback + forge response

---

## What is deferred

- Streaming token output (forge responses appear complete, not char-by-char)
- Pane layout / multi-agent display
- Scrolling within the static log (terminal scrollback handles this)
- Keyboard shortcuts beyond Enter / Backspace / Ctrl+C
- `icarus-web` — same `RuntimeBus` contract; `WsRuntimeBusLive` bridges queues over WebSocket/SSE
- Running runtime on VPS + remote icarus client (network transport replaces in-process queues)
