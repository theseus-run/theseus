/**
 * DispatchRegistry — tracks active dispatches in the runtime process.
 *
 * In-memory (Ref-backed Map), intentionally independent from transport
 * protocol types.
 */

import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Clock, Context, Effect, Ref } from "effect";
import type { DispatchSession, WorkNodeId, WorkNodeState } from "./runtime/types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistryEntry {
  readonly handle: Dispatch.DispatchHandle;
  readonly workNodeId: WorkNodeId;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parentWorkNodeId?: WorkNodeId;
  readonly relation: DispatchSession["relation"];
  readonly name: string;
  readonly modelRequest?: DispatchSession["modelRequest"];
  readonly startedAt: number;
  iteration: number;
  usage: Dispatch.Usage;
  state: WorkNodeState;
}

// ---------------------------------------------------------------------------
// DispatchRegistry — service definition
// ---------------------------------------------------------------------------

export class DispatchRegistry extends Context.Service<
  DispatchRegistry,
  {
    readonly register: (
      handle: Dispatch.DispatchHandle,
      session: Pick<
        DispatchSession,
        | "workNodeId"
        | "missionId"
        | "capsuleId"
        | "parentWorkNodeId"
        | "relation"
        | "name"
        | "modelRequest"
      >,
    ) => Effect.Effect<void>;
    readonly get: (dispatchId: string) => Effect.Effect<Dispatch.DispatchHandle | null>;
    readonly remove: (dispatchId: string) => Effect.Effect<void>;
    readonly updateStatus: (
      dispatchId: string,
      update: Partial<Pick<RegistryEntry, "iteration" | "usage" | "state">>,
    ) => Effect.Effect<void>;
  }
>()("DispatchRegistry") {}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const DispatchRegistryLive = Effect.gen(function* () {
  const ref = yield* Ref.make<Map<string, RegistryEntry>>(new Map());

  return {
    register: (
      handle: Dispatch.DispatchHandle,
      session: Pick<
        DispatchSession,
        | "workNodeId"
        | "missionId"
        | "capsuleId"
        | "parentWorkNodeId"
        | "relation"
        | "name"
        | "modelRequest"
      >,
    ) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis;
        yield* Ref.update(ref, (m) => {
          const next = new Map(m);
          next.set(handle.dispatchId, {
            handle,
            workNodeId: session.workNodeId,
            missionId: session.missionId,
            capsuleId: session.capsuleId,
            ...(session.parentWorkNodeId !== undefined
              ? { parentWorkNodeId: session.parentWorkNodeId }
              : {}),
            relation: session.relation,
            name: session.name,
            ...(session.modelRequest !== undefined ? { modelRequest: session.modelRequest } : {}),
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
  };
});
