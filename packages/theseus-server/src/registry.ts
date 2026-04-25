/**
 * DispatchRegistry — tracks active dispatches in the server process.
 *
 * In-memory (Ref-backed Map). Simplified from the daemon version:
 * no dependency on Daemon protocol types — uses plain status entries.
 */

import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Clock, Context, Effect, Ref } from "effect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistryEntry {
  readonly handle: Dispatch.DispatchHandle;
  readonly name: string;
  readonly startedAt: number;
  iteration: number;
  usage: Dispatch.Usage;
  state: "running" | "done" | "failed";
}

export interface StatusEntry {
  readonly dispatchId: string;
  readonly name: string;
  readonly iteration: number;
  readonly state: "running" | "done" | "failed";
  readonly usage: Dispatch.Usage;
}

// ---------------------------------------------------------------------------
// DispatchRegistry — service definition
// ---------------------------------------------------------------------------

export class DispatchRegistry extends Context.Service<
  DispatchRegistry,
  {
    readonly register: (handle: Dispatch.DispatchHandle, name: string) => Effect.Effect<void>;
    readonly get: (dispatchId: string) => Effect.Effect<Dispatch.DispatchHandle | null>;
    readonly remove: (dispatchId: string) => Effect.Effect<void>;
    readonly updateStatus: (
      dispatchId: string,
      update: Partial<Pick<RegistryEntry, "iteration" | "usage" | "state">>,
    ) => Effect.Effect<void>;
    readonly list: () => Effect.Effect<ReadonlyArray<StatusEntry>>;
  }
>()("DispatchRegistry") {}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const DispatchRegistryLive = Effect.gen(function* () {
  const ref = yield* Ref.make<Map<string, RegistryEntry>>(new Map());

  return {
    register: (handle: Dispatch.DispatchHandle, name: string) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis;
        yield* Ref.update(ref, (m) => {
          const next = new Map(m);
          next.set(handle.dispatchId, {
            handle,
            name,
            startedAt,
            iteration: 0,
            usage: { inputTokens: 0, outputTokens: 0 },
            state: "running",
          });
          return next;
        });
      }),

    get: (dispatchId: string) =>
      Ref.get(ref).pipe(Effect.map((m) => m.get(dispatchId)?.handle ?? null)),

    remove: (dispatchId: string) =>
      Ref.update(ref, (m) => {
        const next = new Map(m);
        next.delete(dispatchId);
        return next;
      }),

    updateStatus: (
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
      }),

    list: () =>
      Ref.get(ref).pipe(
        Effect.map((m) =>
          Array.from(m.values()).map(
            (e): StatusEntry => ({
              dispatchId: e.handle.dispatchId,
              name: e.name,
              iteration: e.iteration,
              state: e.state,
              usage: e.usage,
            }),
          ),
        ),
      ),
  };
});
