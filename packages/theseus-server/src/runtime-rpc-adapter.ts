import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import {
  type DispatchSession,
  type MissionCreateInput,
  type MissionSession,
  type MissionStartDispatchInput,
  RuntimeCommands,
  type RuntimeDispatchEvent,
  type RuntimeError,
  RuntimeQueries,
  TheseusRuntime,
} from "@theseus.run/runtime";
import { Context, Effect, Layer, type Stream } from "effect";

export interface RuntimeRpcAdapterService {
  readonly createMission: (
    input: MissionCreateInput,
  ) => Effect.Effect<MissionSession, RuntimeError>;
  readonly startMissionDispatch: (
    input: MissionStartDispatchInput,
  ) => Effect.Effect<
    { readonly session: DispatchSession; readonly events: Stream.Stream<RuntimeDispatchEvent> },
    RuntimeError
  >;
  readonly listMissions: () => Effect.Effect<ReadonlyArray<MissionSession>, RuntimeError>;
  readonly getMission: (missionId: string) => Effect.Effect<MissionSession, RuntimeError>;
  readonly listRuntimeDispatches: (options?: {
    readonly limit?: number;
  }) => Effect.Effect<ReadonlyArray<DispatchSession>, RuntimeError>;
  readonly getMessages: (
    dispatchId: string,
  ) => Effect.Effect<
    ReadonlyArray<{ readonly role: string; readonly content: string }>,
    RuntimeError
  >;
  readonly getResult: (dispatchId: string) => Effect.Effect<Dispatch.DispatchOutput, RuntimeError>;
  readonly getCapsuleEvents: (
    capsuleId: string,
  ) => Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeError>;
  readonly getDispatchCapsuleEvents: (
    dispatchId: string,
  ) => Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeError>;
  readonly status: () => Effect.Effect<ReadonlyArray<DispatchSession>, RuntimeError>;
  readonly inject: (dispatchId: string, text: string) => Effect.Effect<void, RuntimeError>;
  readonly interrupt: (dispatchId: string) => Effect.Effect<void, RuntimeError>;
}

export class RuntimeRpcAdapter extends Context.Service<
  RuntimeRpcAdapter,
  RuntimeRpcAdapterService
>()("RuntimeRpcAdapter") {}

export const RuntimeRpcAdapterLive = Layer.effect(RuntimeRpcAdapter)(
  Effect.gen(function* () {
    const runtime = yield* TheseusRuntime;
    return RuntimeRpcAdapter.of({
      createMission: (input) => RuntimeCommands.createMission(runtime, input),
      startMissionDispatch: (input) => RuntimeCommands.startMissionDispatch(runtime, input),
      listMissions: () => RuntimeQueries.listMissions(runtime),
      getMission: (missionId) => RuntimeQueries.getMission(runtime, missionId),
      listRuntimeDispatches: (options) => RuntimeQueries.listDispatches(runtime, options),
      getMessages: (dispatchId) => RuntimeQueries.getMessages(runtime, dispatchId),
      getResult: (dispatchId) => RuntimeQueries.getResult(runtime, dispatchId),
      getCapsuleEvents: (capsuleId) => RuntimeQueries.getCapsuleEvents(runtime, capsuleId),
      getDispatchCapsuleEvents: (dispatchId) =>
        RuntimeQueries.getDispatchCapsuleEvents(runtime, dispatchId),
      status: () => RuntimeQueries.status(runtime),
      inject: (dispatchId, text) => runtime.control({ _tag: "DispatchInject", dispatchId, text }),
      interrupt: (dispatchId) => runtime.control({ _tag: "DispatchInterrupt", dispatchId }),
    });
  }),
);
