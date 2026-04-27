/**
 * DispatchRegistry — tracks active dispatches in the runtime process.
 *
 * In-memory (Ref-backed Map), intentionally independent from transport
 * protocol types.
 */

import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Clock, Context, Effect, Ref } from "effect";
import type { StatusEntry, WorkNodeState } from "./runtime/types.ts";
import { WorkControlDescriptors } from "./runtime/work-control.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistryEntry {
  readonly handle: Dispatch.DispatchHandle;
  readonly workNodeId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parentWorkNodeId?: string;
  readonly relation: StatusEntry["relation"];
  readonly name: string;
  readonly modelRequest?: StatusEntry["modelRequest"];
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
        StatusEntry,
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
    readonly list: () => Effect.Effect<ReadonlyArray<StatusEntry>>;
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
        StatusEntry,
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

    list: () =>
      Ref.get(ref).pipe(
        Effect.map((m) =>
          Array.from(m.values()).map(
            (e): StatusEntry => ({
              dispatchId: e.handle.dispatchId,
              workNodeId: e.workNodeId,
              missionId: e.missionId,
              capsuleId: e.capsuleId,
              ...(e.parentWorkNodeId !== undefined ? { parentWorkNodeId: e.parentWorkNodeId } : {}),
              kind: "dispatch",
              relation: e.relation,
              label: e.name,
              control: WorkControlDescriptors.dispatch(e.state),
              name: e.name,
              ...(e.modelRequest !== undefined ? { modelRequest: e.modelRequest } : {}),
              iteration: e.iteration,
              state: e.state,
              usage: e.usage,
              startedAt: e.startedAt,
            }),
          ),
        ),
      ),
  };
});
