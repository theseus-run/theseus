import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect, Match, type Stream } from "effect";
import type {
  DispatchSession,
  MissionCreateInput,
  MissionSession,
  MissionStartDispatchInput,
  RuntimeDispatchEvent,
  RuntimeError,
  TheseusRuntimeService,
  WorkControlCommand,
  WorkNodeSession,
} from "./types.ts";
import { WorkNodeId } from "./types.ts";

const unexpectedQueryResult = Effect.die("Runtime query returned unexpected result");

export const RuntimeCommands = {
  createMission: (
    runtime: TheseusRuntimeService,
    input: MissionCreateInput,
  ): Effect.Effect<MissionSession, RuntimeError> =>
    runtime.submit({ _tag: "MissionCreate", input }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("MissionCreated", ({ mission }) => Effect.succeed(mission)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),

  startMissionDispatch: (
    runtime: TheseusRuntimeService,
    input: MissionStartDispatchInput,
  ): Effect.Effect<
    { readonly session: DispatchSession; readonly events: Stream.Stream<RuntimeDispatchEvent> },
    RuntimeError
  > =>
    runtime.submit({ _tag: "MissionStartDispatch", input }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("DispatchStarted", ({ session, events }) =>
            Effect.succeed({ session, events }),
          ),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),
};

export const RuntimeControls = {
  controlWorkNode: (
    runtime: TheseusRuntimeService,
    workNodeId: string,
    command: WorkControlCommand,
  ): Effect.Effect<void, RuntimeError> =>
    runtime.control({ _tag: "WorkNodeControl", workNodeId: WorkNodeId.make(workNodeId), command }),
};

export const RuntimeQueries = {
  listMissions: (
    runtime: TheseusRuntimeService,
  ): Effect.Effect<ReadonlyArray<MissionSession>, RuntimeError> =>
    runtime.query({ _tag: "MissionList" }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("MissionList", ({ missions }) => Effect.succeed(missions)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),

  getMission: (
    runtime: TheseusRuntimeService,
    missionId: string,
  ): Effect.Effect<MissionSession, RuntimeError> =>
    runtime.query({ _tag: "MissionGet", missionId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("MissionGet", ({ mission }) => Effect.succeed(mission)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),

  listRuntimeDispatches: (
    runtime: TheseusRuntimeService,
    options?: { readonly limit?: number },
  ): Effect.Effect<ReadonlyArray<DispatchSession>, RuntimeError> =>
    runtime
      .query(options === undefined ? { _tag: "DispatchList" } : { _tag: "DispatchList", options })
      .pipe(
        Effect.flatMap((result) =>
          Match.value(result).pipe(
            Match.tag("DispatchList", ({ dispatches }) => Effect.succeed(dispatches)),
            Match.orElse(() => unexpectedQueryResult),
          ),
        ),
      ),

  getMissionWorkTree: (
    runtime: TheseusRuntimeService,
    missionId: string,
  ): Effect.Effect<ReadonlyArray<WorkNodeSession>, RuntimeError> =>
    runtime.query({ _tag: "MissionWorkTree", missionId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("MissionWorkTree", ({ nodes }) => Effect.succeed(nodes)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),

  getResult: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<Dispatch.DispatchOutput, RuntimeError> =>
    runtime.query({ _tag: "DispatchResult", dispatchId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("DispatchResult", ({ result }) => Effect.succeed(result)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),

  getCapsuleEvents: (
    runtime: TheseusRuntimeService,
    capsuleId: string,
  ): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeError> =>
    runtime.query({ _tag: "CapsuleEvents", capsuleId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("CapsuleEvents", ({ events }) => Effect.succeed(events)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),

  getDispatchCapsuleEvents: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeError> =>
    runtime.query({ _tag: "DispatchCapsuleEvents", dispatchId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("DispatchCapsuleEvents", ({ events }) => Effect.succeed(events)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),

  getDispatchEvents: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<ReadonlyArray<Dispatch.DispatchEventEntry>, RuntimeError> =>
    runtime.query({ _tag: "DispatchEvents", dispatchId }).pipe(
      Effect.flatMap((result) =>
        Match.value(result).pipe(
          Match.tag("DispatchEvents", ({ events }) => Effect.succeed(events)),
          Match.orElse(() => unexpectedQueryResult),
        ),
      ),
    ),
};
