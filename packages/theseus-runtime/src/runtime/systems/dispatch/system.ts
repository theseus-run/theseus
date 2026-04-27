import * as Agent from "@theseus.run/core/Agent";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import { Cause, Effect, Exit, Layer, Stream } from "effect";
import type { DispatchRegistry } from "../../../registry.ts";
import { TheseusDb } from "../../../store/sqlite.ts";
import { SqliteCurrentCapsuleByIdLive } from "../../../store/sqlite-capsule.ts";
import type { ToolCatalog } from "../../../tool-catalog.ts";
import { RuntimeEvents } from "../../events.ts";
import { getMissionCapsuleId, recordDispatchSession } from "../../projections/session/store.ts";
import { CapsuleSink } from "../../sinks/capsule/sink.ts";
import {
  type DispatchSession,
  type MissionStartDispatchInput,
  type RuntimeDispatchEvent,
  RuntimeNotFound,
  RuntimeToolNotFound,
} from "../../types.ts";

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
  readonly languageModelGateway: (typeof Dispatch.LanguageModelGateway)["Service"];
  readonly satelliteRing: (typeof Satellite.SatelliteRing)["Service"];
  readonly dispatchStore: (typeof Dispatch.DispatchStore)["Service"];
  readonly blueprintRegistry: (typeof Agent.BlueprintRegistry)["Service"];
  readonly db: (typeof TheseusDb)["Service"];
}

type RuntimeToolRequirements =
  | Agent.BlueprintRegistry
  | Dispatch.LanguageModelGateway
  | Satellite.SatelliteRing
  | Dispatch.DispatchStore
  | Dispatch.CurrentDispatch
  | CapsuleNs.CurrentCapsule
  | Agent.AgentIdentity;

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
) =>
  Layer.mergeAll(
    Layer.succeed(Dispatch.LanguageModelGateway)(deps.languageModelGateway),
    Layer.succeed(Satellite.SatelliteRing)(deps.satelliteRing),
    Layer.succeed(Dispatch.DispatchStore)(deps.dispatchStore),
    Layer.succeed(Agent.BlueprintRegistry)(deps.blueprintRegistry),
    Layer.succeed(CapsuleNs.CurrentCapsule)(currentCapsule),
    Agent.AgentIdentityLive(specName),
  );

const watchDispatchCompletion = (input: {
  readonly handle: Dispatch.DispatchHandle;
  readonly capsule: CapsuleNs.CapsuleRecord;
  readonly registry: (typeof DispatchRegistry)["Service"];
  readonly store: (typeof Dispatch.DispatchStore)["Service"];
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
            yield* CapsuleSink.missionTransition(input.capsule, "running", "done");
            yield* input.registry.updateStatus(input.handle.dispatchId, {
              state: "done",
              usage: result.usage,
            });
          }),
        onFailure: (cause) =>
          Effect.gen(function* () {
            const reason = reasonFromCause(cause);
            yield* CapsuleSink.dispatchFailed(input.capsule, {
              dispatchId: input.handle.dispatchId,
              reason,
            });
            yield* CapsuleSink.missionTransition(input.capsule, "running", "failed");
            yield* input.registry.updateStatus(input.handle.dispatchId, { state: "failed" });
          }),
      }),
    ),
  );

const observableEvents = (
  session: DispatchSession,
  handle: Dispatch.DispatchHandle,
  registry: (typeof DispatchRegistry)["Service"],
): Stream.Stream<RuntimeDispatchEvent> =>
  Stream.make(RuntimeEvents.dispatchSessionStarted(session)).pipe(
    Stream.concat(
      handle.events.pipe(
        Stream.filter((event) => !SKIP_EVENT_TAGS.has(event._tag)),
        Stream.tap((event) =>
          event._tag === "Calling"
            ? registry.updateStatus(handle.dispatchId, { iteration: event.iteration })
            : Effect.void,
        ),
        Stream.map((event): RuntimeDispatchEvent => RuntimeEvents.dispatchObserved(session, event)),
      ),
    ),
  );

export const startDispatch = (
  deps: DispatchRunnerDeps,
  { missionId, spec: serializedSpec, task, continueFrom }: MissionStartDispatchInput,
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

    yield* CapsuleSink.missionTransition(currentCapsule, "pending", "running");

    const handle = yield* Effect.provide(
      Dispatch.dispatch(spec, task, options),
      makeDispatchDepsLayer(deps, spec.name, currentCapsule),
    );
    const session: DispatchSession = {
      dispatchId: handle.dispatchId,
      ...(options?.parentDispatchId !== undefined
        ? { parentDispatchId: options.parentDispatchId }
        : {}),
      missionId,
      capsuleId,
      name: spec.name,
      ...(spec.modelRequest !== undefined ? { modelRequest: spec.modelRequest } : {}),
      iteration: 0,
      state: "running",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    yield* recordDispatchSession(deps.db, session);
    yield* CapsuleSink.dispatchStart(currentCapsule, {
      task,
      name: spec.name,
      continueFrom,
      dispatchId: handle.dispatchId,
      missionId,
    });
    yield* deps.registry.register(handle, session);

    yield* Effect.forkDetach({ startImmediately: true })(
      watchDispatchCompletion({
        handle,
        capsule: currentCapsule,
        registry: deps.registry,
        store: deps.dispatchStore,
      }),
    );

    return { session, events: observableEvents(session, handle, deps.registry) };
  });
