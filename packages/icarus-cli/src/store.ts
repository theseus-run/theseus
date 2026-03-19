/**
 * EventStore — plain JS class implementing the useSyncExternalStore contract.
 *
 * The Effect drain fiber calls .push() / .updateAgent() as plain synchronous JS.
 * React subscribes via subscribe/getSnapshot and re-renders on each change.
 *
 * This is intentionally NOT an Effect Ref — it lives in the React/JS layer,
 * not the Effect layer. The separation is correct.
 */
import type { NodeStatus, UIEvent } from "@theseus.run/runtime";

export interface AgentSnapshot {
  readonly id: string;
  readonly status: NodeStatus;
  readonly currentTask?: string;
}

export interface StoreSnapshot {
  readonly events: ReadonlyArray<UIEvent>;
  readonly agents: ReadonlyMap<string, AgentSnapshot>;
}

const INITIAL_AGENTS: ReadonlyMap<string, AgentSnapshot> = new Map<string, AgentSnapshot>([
  ["theseus", { id: "theseus", status: "starting" }],
  ["forge-1", { id: "forge-1", status: "starting" }],
]);

export class EventStore {
  private _events: UIEvent[] = [];
  private _agents: Map<string, AgentSnapshot> = new Map(INITIAL_AGENTS);
  private _snapshot: StoreSnapshot = { events: [], agents: new Map(INITIAL_AGENTS) };
  private _listeners: Set<() => void> = new Set();

  /** Called by the Effect drain fiber — synchronous, no await. */
  push(event: UIEvent): void {
    this._events = [...this._events, event];
    this._commit();
  }

  /** Called by the Effect drain fiber — synchronous, no await. */
  updateAgent(id: string, status: NodeStatus, currentTask?: string): void {
    const prev = this._agents.get(id);
    if (prev?.status === status && prev?.currentTask === currentTask) return;
    this._agents = new Map(this._agents);
    this._agents.set(id, { id, status, ...(currentTask !== undefined ? { currentTask } : {}) });
    this._commit();
  }

  private _commit(): void {
    this._snapshot = { events: this._events, agents: this._agents };
    for (const cb of this._listeners) cb();
  }

  // useSyncExternalStore contract
  subscribe = (cb: () => void): (() => void) => {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  };

  getSnapshot = (): StoreSnapshot => this._snapshot;
}
