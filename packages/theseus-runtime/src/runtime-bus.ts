/**
 * RuntimeBus — the Effect-native transport between the headless Theseus
 * runtime and any interface layer (icarus-cli, icarus-web, …).
 *
 * Two queues:
 *   events   — runtime → interface   (UIEvent stream)
 *   commands — interface → runtime   (RuntimeCommand stream)
 *
 * Convenience helpers:
 *   emit(event)    — offer one UIEvent to the events queue
 *   nextCommand    — take one RuntimeCommand from the commands queue
 */
import { Effect, Queue, ServiceMap } from "effect";

// ---------------------------------------------------------------------------
// UIEvent — everything the interface needs to render
// ---------------------------------------------------------------------------

export type LogLevel = "info" | "warn" | "error";

/**
 * Display status of an agent node in the routing diagram.
 * Distinct from AgentStatus in agent.ts (which is the fiber/registry lifecycle).
 */
export type NodeStatus = "starting" | "idle" | "working";

/** @deprecated Use NodeStatus */
export type ForgeStatus = NodeStatus;

export type UIEvent =
  | {
      readonly _tag: "Log";
      readonly level: LogLevel;
      readonly agent: string;
      readonly message: string;
      readonly ts: number;
    }
  | {
      readonly _tag: "ToolCall";
      readonly taskId: string;
      readonly tool: string;
      readonly args: string;
      readonly ts: number;
    }
  | {
      readonly _tag: "ToolResult";
      readonly taskId: string;
      readonly tool: string;
      readonly preview: string;
      readonly ok: boolean;
      readonly ts: number;
    }
  | { readonly _tag: "TheseusResponse"; readonly content: string; readonly ts: number }
  | {
      readonly _tag: "AgentResponse";
      readonly agentId: string;
      readonly taskId: string;
      readonly content: string;
      readonly ts: number;
    }
  | {
      readonly _tag: "StatusChange";
      readonly agentId: string;
      readonly status: NodeStatus;
      readonly currentTask?: string;
      readonly ts: number;
    };

// ---------------------------------------------------------------------------
// RuntimeCommand — everything the interface can send to the runtime
// ---------------------------------------------------------------------------

export type RuntimeCommand =
  | { readonly _tag: "Dispatch"; readonly instruction: string }
  | { readonly _tag: "Steer"; readonly guidance: string }
  | { readonly _tag: "Stop" };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RuntimeBus extends ServiceMap.Service<
  RuntimeBus,
  {
    readonly events: Queue.Queue<UIEvent>;
    readonly commands: Queue.Queue<RuntimeCommand>;
  }
>()("RuntimeBus") {}

// ---------------------------------------------------------------------------
// Convenience helpers (for use inside the runtime)
// ---------------------------------------------------------------------------

/** Offer one UIEvent to the events queue. Requires RuntimeBus in env. */
export const emit = (event: UIEvent): Effect.Effect<void, never, RuntimeBus> =>
  Effect.gen(function* () {
    const bus = yield* RuntimeBus;
    yield* Queue.offer(bus.events, event);
  });

/** Take one RuntimeCommand from the commands queue (blocks until available). */
export const nextCommand: Effect.Effect<RuntimeCommand, never, RuntimeBus> = Effect.gen(
  function* () {
    const bus = yield* RuntimeBus;
    return yield* Queue.take(bus.commands);
  },
);
