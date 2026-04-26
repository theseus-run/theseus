import * as Agent from "@theseus.run/core/Agent";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import { Cause, Effect, Exit, Layer, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type { DispatchRegistry } from "../registry.ts";
import { TheseusDb } from "../store/sqlite.ts";
import { SqliteCurrentCapsuleLive } from "../store/sqlite-capsule.ts";
import type { ToolCatalog } from "../tool-catalog.ts";
import { RuntimeNotFound, RuntimeToolNotFound, type StartDispatchInput } from "./types.ts";

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
  readonly languageModel: (typeof LanguageModel.LanguageModel)["Service"];
  readonly satelliteRing: (typeof Satellite.SatelliteRing)["Service"];
  readonly dispatchStore: (typeof Dispatch.DispatchStore)["Service"];
  readonly db: (typeof TheseusDb)["Service"];
}

const restoreOptions = (
  store: (typeof Dispatch.DispatchStore)["Service"],
  continueFrom: string | undefined,
  task: string,
): Effect.Effect<Dispatch.DispatchOptions | undefined, RuntimeNotFound> =>
  continueFrom === undefined
    ? Effect.succeed(undefined)
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
  name: string,
): Effect.Effect<CapsuleNs.CapsuleRecord> => {
  const dbLayer = Layer.succeed(TheseusDb)(db);
  return Effect.provide(
    Effect.service(CapsuleNs.CurrentCapsule),
    Layer.provide(SqliteCurrentCapsuleLive(name), dbLayer),
  );
};

const makeDispatchDepsLayer = (
  deps: DispatchRunnerDeps,
  specName: string,
  currentCapsule: CapsuleNs.CapsuleRecord,
) =>
  Layer.mergeAll(
    Layer.succeed(LanguageModel.LanguageModel)(deps.languageModel),
    Layer.succeed(Satellite.SatelliteRing)(deps.satelliteRing),
    Layer.succeed(Dispatch.DispatchStore)(deps.dispatchStore),
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
            yield* input.capsule.log({
              type: "dispatch.done",
              by: "runtime",
              data: { dispatchId: input.handle.dispatchId, content: result.content },
            });
            yield* input.registry.updateStatus(input.handle.dispatchId, {
              state: "done",
              usage: result.usage,
            });
          }),
        onFailure: (cause) =>
          Effect.gen(function* () {
            const reason = reasonFromCause(cause);
            yield* input.capsule.log({
              type: "dispatch.failed",
              by: "runtime",
              data: { dispatchId: input.handle.dispatchId, reason },
            });
            yield* input.registry.updateStatus(input.handle.dispatchId, { state: "failed" });
          }),
      }),
    ),
  );

const observableEvents = (
  handle: Dispatch.DispatchHandle,
  registry: (typeof DispatchRegistry)["Service"],
): Stream.Stream<Dispatch.DispatchEvent> =>
  handle.events.pipe(
    Stream.filter((event) => !SKIP_EVENT_TAGS.has(event._tag)),
    Stream.tap((event) =>
      event._tag === "Calling"
        ? registry.updateStatus(handle.dispatchId, { iteration: event.iteration })
        : Effect.void,
    ),
  );

export const startDispatch = (
  deps: DispatchRunnerDeps,
  { spec: serializedSpec, task, continueFrom }: StartDispatchInput,
): Effect.Effect<Stream.Stream<Dispatch.DispatchEvent>, RuntimeNotFound | RuntimeToolNotFound> =>
  Effect.gen(function* () {
    const spec = yield* deps.toolCatalog
      .hydrate(serializedSpec)
      .pipe(Effect.mapError((error) => new RuntimeToolNotFound({ names: error.names })));
    const options = yield* restoreOptions(deps.dispatchStore, continueFrom, task);
    const currentCapsule = yield* makeCurrentCapsule(deps.db, spec.name);

    yield* currentCapsule.log({
      type: "dispatch.start",
      by: "runtime",
      data: { task, name: spec.name, continueFrom },
    });

    const handle = yield* Effect.provide(
      Dispatch.dispatch(spec, task, options),
      makeDispatchDepsLayer(deps, spec.name, currentCapsule),
    );
    yield* deps.registry.register(handle, spec.name);

    yield* Effect.forkDetach({ startImmediately: true })(
      watchDispatchCompletion({
        handle,
        capsule: currentCapsule,
        registry: deps.registry,
        store: deps.dispatchStore,
      }),
    );

    return observableEvents(handle, deps.registry);
  });
