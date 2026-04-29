import * as Agent from "@theseus.run/core/Agent";
import * as AgentComm from "@theseus.run/core/AgentComm";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import { Cause, Clock, Effect, Exit, Layer, Match, Stream } from "effect";
import type { DispatchRegistry } from "../../../registry.ts";
import { TheseusDb } from "../../../store/sqlite.ts";
import { SqliteCurrentCapsuleByIdLive } from "../../../store/sqlite-capsule.ts";
import type { ToolCatalog } from "../../../tool-catalog.ts";
import type { RuntimeEventBus } from "../../event-bus.ts";
import { RuntimeEvents } from "../../events.ts";
import { getMissionCapsuleId } from "../../projections/session/store.ts";
import { recordWorkNode, updateWorkNodeDispatchStatus } from "../../projections/work-tree/store.ts";
import { CapsuleSink } from "../../sinks/capsule/sink.ts";
import {
  type DispatchSession,
  type MissionStartDispatchInput,
  type RuntimeDispatchEvent,
  RuntimeNotFound,
  RuntimeToolNotFound,
  WorkNodeId,
  type WorkNodeRelation,
} from "../../types.ts";
import { CurrentWorkNode, type CurrentWorkNodeValue } from "../../work-context.ts";
import { WorkControlDescriptors } from "../../work-control.ts";
import type { WorkSupervisor } from "../../work-supervisor.ts";

const SKIP_EVENT_TAGS = new Set(["Thinking"]);

const dispatchOptionsFromParent = (
  restored: Dispatch.DispatchOptions,
  parentDispatchId: string,
  task: string,
): Dispatch.DispatchOptions => ({
  messages: [...(restored.messages ?? []), { role: "user", content: task }],
  ...(restored.iteration !== undefined ? { iteration: restored.iteration } : {}),
  ...(restored.usage !== undefined ? { usage: restored.usage } : {}),
  parentDispatchId,
});

const reasonFromCause = (cause: Cause.Cause<unknown>): string =>
  Cause.hasInterruptsOnly(cause) ? "Fiber interrupted" : String(Cause.squash(cause));

export interface DispatchRunnerDeps {
  readonly registry: (typeof DispatchRegistry)["Service"];
  readonly toolCatalog: (typeof ToolCatalog)["Service"];
  readonly cortex: (typeof Dispatch.Cortex)["Service"];
  readonly languageModelGateway: (typeof Dispatch.LanguageModelGateway)["Service"];
  readonly satelliteRing: (typeof Satellite.SatelliteRing)["Service"];
  readonly dispatchStore: (typeof Dispatch.DispatchStore)["Service"];
  readonly blueprintRegistry: (typeof Agent.BlueprintRegistry)["Service"];
  readonly eventBus: (typeof RuntimeEventBus)["Service"];
  readonly workSupervisor: (typeof WorkSupervisor)["Service"];
  readonly db: (typeof TheseusDb)["Service"];
}

type RuntimeToolRequirements =
  | Agent.BlueprintRegistry
  | AgentComm.DispatchGruntLauncher
  | Dispatch.Cortex
  | Dispatch.LanguageModelGateway
  | Satellite.SatelliteRing
  | Dispatch.DispatchStore
  | Dispatch.CurrentDispatch
  | CapsuleNs.CurrentCapsule
  | Agent.AgentIdentity
  | CurrentWorkNode;

const restoreOptions = (
  store: (typeof Dispatch.DispatchStore)["Service"],
  continueFrom: string | undefined,
  task: string,
): Effect.Effect<Dispatch.DispatchOptions | undefined, RuntimeNotFound> =>
  continueFrom === undefined
    ? Effect.as(Effect.void, undefined)
    : store
        .restore(continueFrom)
        .pipe(
          Effect.flatMap((restored) =>
            restored
              ? Effect.succeed(dispatchOptionsFromParent(restored, continueFrom, task))
              : Effect.fail(new RuntimeNotFound({ kind: "dispatch", id: continueFrom })),
          ),
        );

const makeCurrentCapsule = (
  db: (typeof TheseusDb)["Service"],
  capsuleId: string,
): Effect.Effect<CapsuleNs.CapsuleRecord> => {
  const dbLayer = Layer.succeed(TheseusDb)(db);
  return Effect.provide(
    Effect.service(CapsuleNs.CurrentCapsule),
    Layer.provide(SqliteCurrentCapsuleByIdLive(capsuleId), dbLayer),
  );
};

const makeDispatchDepsLayer = (
  deps: DispatchRunnerDeps,
  specName: string,
  currentCapsule: CapsuleNs.CapsuleRecord,
  currentWorkNode: CurrentWorkNodeValue,
) =>
  Layer.mergeAll(
    Layer.succeed(Dispatch.Cortex)(deps.cortex),
    Layer.succeed(Dispatch.LanguageModelGateway)(deps.languageModelGateway),
    Layer.succeed(Satellite.SatelliteRing)(deps.satelliteRing),
    Layer.succeed(Dispatch.DispatchStore)(deps.dispatchStore),
    Layer.succeed(Agent.BlueprintRegistry)(deps.blueprintRegistry),
    Layer.succeed(CapsuleNs.CurrentCapsule)(currentCapsule),
    Layer.succeed(CurrentWorkNode)(currentWorkNode),
    Layer.effect(AgentComm.DispatchGruntLauncher)(
      makeDispatchGruntLauncher(deps, currentCapsule, currentWorkNode),
    ),
    Agent.AgentIdentityLive(specName),
  );

const watchDispatchCompletion = (input: {
  readonly handle: Dispatch.DispatchHandle;
  readonly workNodeId: WorkNodeId;
  readonly capsule: CapsuleNs.CapsuleRecord;
  readonly registry: (typeof DispatchRegistry)["Service"];
  readonly store: (typeof Dispatch.DispatchStore)["Service"];
  readonly db: (typeof TheseusDb)["Service"];
  readonly workSupervisor: (typeof WorkSupervisor)["Service"];
  readonly completesMission: boolean;
}): Effect.Effect<void> =>
  input.handle.result.pipe(
    Effect.exit,
    Effect.flatMap((exit) =>
      Exit.match(exit, {
        onSuccess: (result) =>
          Effect.gen(function* () {
            yield* input.store.snapshot(input.handle.dispatchId, -1, result.messages, result.usage);
            yield* CapsuleSink.dispatchDone(input.capsule, {
              dispatchId: input.handle.dispatchId,
              result,
            });
            if (input.completesMission) {
              yield* CapsuleSink.missionTransition(input.capsule, "running", "done");
            }
            yield* updateWorkNodeDispatchStatus(input.db, {
              dispatchId: input.handle.dispatchId,
              state: "done",
              usage: result.usage,
              completedAt: yield* Clock.currentTimeMillis,
            });
            yield* input.registry.updateStatus(input.handle.dispatchId, {
              state: "done",
              usage: result.usage,
            });
            yield* input.workSupervisor.updateState(input.workNodeId, "done");
          }),
        onFailure: (cause) =>
          Effect.gen(function* () {
            const reason = reasonFromCause(cause);
            yield* CapsuleSink.dispatchFailed(input.capsule, {
              dispatchId: input.handle.dispatchId,
              reason,
            });
            if (input.completesMission) {
              yield* CapsuleSink.missionTransition(input.capsule, "running", "failed");
            }
            yield* updateWorkNodeDispatchStatus(input.db, {
              dispatchId: input.handle.dispatchId,
              state: "failed",
              completedAt: yield* Clock.currentTimeMillis,
            });
            yield* input.registry.updateStatus(input.handle.dispatchId, { state: "failed" });
            yield* input.workSupervisor.updateState(input.workNodeId, "failed", reason);
          }),
      }),
    ),
  );

const publishDispatchEvents = (
  session: DispatchSession,
  handle: Dispatch.DispatchHandle,
  registry: (typeof DispatchRegistry)["Service"],
  db: (typeof TheseusDb)["Service"],
  eventBus: (typeof RuntimeEventBus)["Service"],
): Effect.Effect<void> =>
  handle.events.pipe(
    Stream.filter((event) => !SKIP_EVENT_TAGS.has(event._tag)),
    Stream.runForEach((event) =>
      Effect.gen(function* () {
        yield* Match.value(event).pipe(
          Match.tag("Calling", ({ iteration }) =>
            Effect.gen(function* () {
              yield* registry.updateStatus(handle.dispatchId, { iteration });
              yield* updateWorkNodeDispatchStatus(db, {
                dispatchId: handle.dispatchId,
                iteration,
              });
            }),
          ),
          Match.orElse(() => Effect.void),
        );
        yield* eventBus.publish(RuntimeEvents.dispatchObserved(session, event));
      }),
    ),
  );

const forkRegisteredProcess = (
  deps: DispatchRunnerDeps,
  workNodeId: WorkNodeId,
  process: string,
  effect: Effect.Effect<void>,
): Effect.Effect<void> =>
  deps.workSupervisor
    .forkProcess(workNodeId, process, effect)
    .pipe(
      Effect.catchTag("RuntimeNotFound", (error) =>
        Effect.die(`registered work node disappeared before ${process}: ${error.id}`),
      ),
    );

interface ConcreteDispatchInput {
  readonly missionId: string;
  readonly capsuleId: string;
  readonly currentCapsule: CapsuleNs.CapsuleRecord;
  readonly spec: Dispatch.DispatchSpec<RuntimeToolRequirements>;
  readonly task: string;
  readonly options?: Dispatch.DispatchOptions;
  readonly parentWorkNodeId?: WorkNodeId;
  readonly relation: WorkNodeRelation;
}

const startConcreteDispatch = (
  deps: DispatchRunnerDeps,
  input: ConcreteDispatchInput,
): Effect.Effect<
  {
    readonly handle: Dispatch.DispatchHandle;
    readonly session: DispatchSession;
  },
  never
> =>
  Effect.gen(function* () {
    const completesMission = input.relation === "root";
    if (completesMission) {
      yield* CapsuleSink.missionTransition(input.currentCapsule, "pending", "running");
    }

    const workNodeId = WorkNodeId.make(yield* Dispatch.makeDispatchId(`work-${input.spec.name}`));
    const currentWorkNode: CurrentWorkNodeValue = {
      workNodeId,
      missionId: input.missionId,
      capsuleId: input.capsuleId,
    };
    const handle = yield* Effect.provide(
      Dispatch.dispatch(input.spec, input.task, input.options),
      makeDispatchDepsLayer(deps, input.spec.name, input.currentCapsule, currentWorkNode),
    );
    const startedAt = yield* Clock.currentTimeMillis;
    const session: DispatchSession = {
      workNodeId,
      missionId: input.missionId,
      capsuleId: input.capsuleId,
      ...(input.parentWorkNodeId !== undefined ? { parentWorkNodeId: input.parentWorkNodeId } : {}),
      kind: "dispatch",
      relation: input.relation,
      label: input.spec.name,
      control: WorkControlDescriptors.dispatch("running"),
      dispatchId: handle.dispatchId,
      name: input.spec.name,
      ...(input.spec.modelRequest !== undefined ? { modelRequest: input.spec.modelRequest } : {}),
      iteration: 0,
      state: "running",
      usage: { inputTokens: 0, outputTokens: 0 },
      startedAt,
    };

    yield* recordWorkNode(deps.db, {
      workNodeId,
      missionId: input.missionId,
      capsuleId: input.capsuleId,
      ...(input.parentWorkNodeId !== undefined ? { parentWorkNodeId: input.parentWorkNodeId } : {}),
      kind: "dispatch",
      relation: input.relation,
      label: input.spec.name,
      dispatchId: handle.dispatchId,
      ...(input.spec.modelRequest !== undefined ? { modelRequest: input.spec.modelRequest } : {}),
      startedAt,
    });
    yield* CapsuleSink.dispatchStart(input.currentCapsule, {
      task: input.task,
      name: input.spec.name,
      continueFrom: input.options?.parentDispatchId,
      dispatchId: handle.dispatchId,
      missionId: input.missionId,
    });
    yield* deps.registry.register(handle, session);
    yield* deps.workSupervisor.registerDispatch(session, handle);
    yield* deps.eventBus.publish(RuntimeEvents.workNodeStarted(session));
    yield* deps.eventBus.publish(RuntimeEvents.dispatchSessionStarted(session));
    yield* forkRegisteredProcess(
      deps,
      workNodeId,
      "dispatch-events",
      publishDispatchEvents(session, handle, deps.registry, deps.db, deps.eventBus),
    );

    yield* forkRegisteredProcess(
      deps,
      workNodeId,
      "dispatch-completion",
      watchDispatchCompletion({
        handle,
        workNodeId,
        capsule: input.currentCapsule,
        registry: deps.registry,
        store: deps.dispatchStore,
        db: deps.db,
        workSupervisor: deps.workSupervisor,
        completesMission,
      }),
    );

    return { handle, session };
  });

const makeDispatchGruntLauncher = (
  deps: DispatchRunnerDeps,
  currentCapsule: CapsuleNs.CapsuleRecord,
  parentWorkNode: CurrentWorkNodeValue,
): Effect.Effect<(typeof AgentComm.DispatchGruntLauncher)["Service"]> =>
  Effect.succeed({
    launch: <R>(input: AgentComm.DispatchGruntLaunchInput<R>) =>
      Effect.gen(function* () {
        const parentDispatch = yield* Dispatch.CurrentDispatch;
        const tools = input.blueprint.tools.some((tool) => tool.name === AgentComm.report.name)
          ? input.blueprint.tools
          : [...input.blueprint.tools, AgentComm.report];
        const spec = {
          ...input.blueprint,
          systemPrompt: input.systemPrompt,
          tools,
        } as Dispatch.DispatchSpec<RuntimeToolRequirements>;
        const started = yield* startConcreteDispatch(deps, {
          missionId: parentWorkNode.missionId,
          capsuleId: parentWorkNode.capsuleId,
          currentCapsule,
          spec,
          task: input.task,
          options: { parentDispatchId: parentDispatch.id },
          parentWorkNodeId: parentWorkNode.workNodeId,
          relation: "delegated",
        });
        return started.handle;
      }) as Effect.Effect<
        Dispatch.DispatchHandle,
        AgentComm.DispatchGruntFailed,
        R | Dispatch.CurrentDispatch
      >,
  });

export const startDispatch = (
  deps: DispatchRunnerDeps,
  {
    missionId,
    spec: serializedSpec,
    task,
    continueFrom,
    parentWorkNodeId,
    relation,
  }: MissionStartDispatchInput,
): Effect.Effect<
  { readonly session: DispatchSession; readonly events: Stream.Stream<RuntimeDispatchEvent> },
  RuntimeNotFound | RuntimeToolNotFound
> =>
  Effect.gen(function* () {
    const hydratedSpec = yield* deps.toolCatalog
      .hydrate(serializedSpec)
      .pipe(Effect.mapError((error) => new RuntimeToolNotFound({ names: error.names })));
    // The catalog is heterogeneous by design. Runtime dispatch provides the
    // known service envelope for first-party tools such as dispatch_grunt.
    const spec = hydratedSpec as Dispatch.DispatchSpec<RuntimeToolRequirements>;
    const options = yield* restoreOptions(deps.dispatchStore, continueFrom, task);
    const capsuleId = yield* getMissionCapsuleId(deps.db, missionId).pipe(
      Effect.flatMap((id) =>
        id === undefined
          ? Effect.fail(new RuntimeNotFound({ kind: "mission", id: missionId }))
          : Effect.succeed(id),
      ),
    );
    const currentCapsule = yield* makeCurrentCapsule(deps.db, capsuleId);
    const started = yield* startConcreteDispatch(deps, {
      missionId,
      capsuleId,
      currentCapsule,
      spec,
      task,
      ...(options !== undefined ? { options } : {}),
      ...(parentWorkNodeId !== undefined
        ? { parentWorkNodeId: WorkNodeId.make(parentWorkNodeId) }
        : {}),
      relation: relation ?? (continueFrom === undefined ? "root" : "continued"),
    });

    return {
      session: started.session,
      events: deps.eventBus
        .streamMission(missionId)
        .pipe(
          Stream.takeUntil(
            (event) =>
              event._tag === "DispatchEvent" &&
              event.dispatchId === started.session.dispatchId &&
              (event.event._tag === "Done" || event.event._tag === "Failed"),
          ),
        ),
    };
  });
