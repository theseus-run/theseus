/**
 * DispatchRegistry — tracks active dispatches in the daemon process.
 *
 * Lives in-memory (Ref-backed Map). The daemon server registers handles
 * when dispatches start and removes them on completion.
 */

import { Effect, Ref } from "effect";
import * as ServiceMap from "effect/ServiceMap";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type * as Daemon from "@theseus.run/core/Daemon";

// ---------------------------------------------------------------------------
// Internal entry — wraps DispatchHandle with metadata
// ---------------------------------------------------------------------------

interface RegistryEntry {
  readonly handle: Dispatch.Handle;
  readonly agent: string;
  readonly startedAt: number;
  iteration: number;
  usage: Dispatch.Usage;
  state: "running" | "done" | "failed";
}

// ---------------------------------------------------------------------------
// DispatchRegistry — service definition
// ---------------------------------------------------------------------------

export class DispatchRegistry extends ServiceMap.Service<
  DispatchRegistry,
  {
    readonly register: (handle: Dispatch.Handle, agent: string) => Effect.Effect<void>;
    readonly get: (dispatchId: string) => Effect.Effect<Dispatch.Handle | null>;
    readonly remove: (dispatchId: string) => Effect.Effect<void>;
    readonly updateStatus: (dispatchId: string, update: Partial<Pick<RegistryEntry, "iteration" | "usage" | "state">>) => Effect.Effect<void>;
    readonly list: () => Effect.Effect<ReadonlyArray<Daemon.DispatchStatusEntry>>;
    readonly size: () => Effect.Effect<number>;
  }
>()("DispatchRegistry") {}

// ---------------------------------------------------------------------------
// Live implementation — Ref<Map>
// ---------------------------------------------------------------------------

export const DispatchRegistryLive = Effect.gen(function* () {
  const ref = yield* Ref.make<Map<string, RegistryEntry>>(new Map());

  const register = (handle: Dispatch.Handle, agent: string) =>
    Ref.update(ref, (m) => {
      const next = new Map(m);
      next.set(handle.dispatchId, {
        handle,
        agent,
        startedAt: Date.now(),
        iteration: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        state: "running",
      });
      return next;
    });

  const get = (dispatchId: string) =>
    Ref.get(ref).pipe(
      Effect.map((m) => m.get(dispatchId)?.handle ?? null),
    );

  const remove = (dispatchId: string) =>
    Ref.update(ref, (m) => {
      const next = new Map(m);
      next.delete(dispatchId);
      return next;
    });

  const updateStatus = (
    dispatchId: string,
    update: Partial<Pick<RegistryEntry, "iteration" | "usage" | "state">>,
  ) =>
    Ref.update(ref, (m) => {
      const entry = m.get(dispatchId);
      if (!entry) return m;
      const next = new Map(m);
      next.set(dispatchId, {
        ...entry,
        ...(update.iteration !== undefined ? { iteration: update.iteration } : {}),
        ...(update.usage !== undefined ? { usage: update.usage } : {}),
        ...(update.state !== undefined ? { state: update.state } : {}),
      });
      return next;
    });

  const list = () =>
    Ref.get(ref).pipe(
      Effect.map((m) =>
        Array.from(m.values()).map((e): Daemon.DispatchStatusEntry => ({
          dispatchId: e.handle.dispatchId,
          agent: e.agent,
          iteration: e.iteration,
          state: e.state,
          usage: e.usage,
        })),
      ),
    );

  const size = () => Ref.get(ref).pipe(Effect.map((m) => m.size));

  return { register, get, remove, updateStatus, list, size };
});
