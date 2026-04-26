/**
 * TheseusRuntime — live work boundary for the server process.
 *
 * HTTP/RPC handlers adapt wire calls into runtime commands. The runtime owns
 * dispatch lifecycle, capability hydration, current capsule binding, active
 * registry updates, and persistence side effects.
 */

import * as Agent from "@theseus.run/core/Agent";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import { Cause, Context, Data, Effect, Exit, Layer, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import { DispatchRegistry, type StatusEntry } from "./registry.ts";
import { TheseusDb } from "./store/sqlite.ts";
import { SqliteCurrentCapsuleLive } from "./store/sqlite-capsule.ts";
import { type SerializedDispatchSpec, ToolCatalog } from "./tool-catalog.ts";

const SKIP_EVENT_TAGS = new Set(["Thinking"]);

export class RuntimeToolNotFound extends Data.TaggedError("RuntimeToolNotFound")<{
  readonly names: ReadonlyArray<string>;
}> {}

export class RuntimeNotFound extends Data.TaggedError("RuntimeNotFound")<{
  readonly id: string;
  readonly kind: "dispatch";
}> {}

export class RuntimeDispatchFailed extends Data.TaggedError("RuntimeDispatchFailed")<{
  readonly id: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type RuntimeError = RuntimeToolNotFound | RuntimeNotFound | RuntimeDispatchFailed;

export interface StartDispatchInput {
  readonly spec: SerializedDispatchSpec;
  readonly task: string;
  readonly continueFrom?: string | undefined;
}

export type RuntimeCommand = {
  readonly _tag: "DispatchStart";
  readonly input: StartDispatchInput;
};

export type RuntimeSubmission = {
  readonly _tag: "DispatchStarted";
  readonly events: Stream.Stream<Dispatch.DispatchEvent>;
};

export type RuntimeControl =
  | {
      readonly _tag: "DispatchInject";
      readonly dispatchId: string;
      readonly text: string;
    }
  | {
      readonly _tag: "DispatchInterrupt";
      readonly dispatchId: string;
    };

export type RuntimeQuery =
  | {
      readonly _tag: "DispatchList";
      readonly options?: { readonly limit?: number };
    }
  | {
      readonly _tag: "DispatchMessages";
      readonly dispatchId: string;
    }
  | {
      readonly _tag: "DispatchResult";
      readonly dispatchId: string;
    }
  | {
      readonly _tag: "CapsuleEvents";
      readonly capsuleId: string;
    }
  | {
      readonly _tag: "ActiveStatus";
    };

export type RuntimeQueryResult =
  | {
      readonly _tag: "DispatchList";
      readonly dispatches: ReadonlyArray<Dispatch.DispatchSummary>;
    }
  | {
      readonly _tag: "DispatchMessages";
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
    }
  | {
      readonly _tag: "DispatchResult";
      readonly result: Dispatch.DispatchOutput;
    }
  | {
      readonly _tag: "CapsuleEvents";
      readonly events: ReadonlyArray<CapsuleNs.CapsuleEvent>;
    }
  | {
      readonly _tag: "ActiveStatus";
      readonly status: ReadonlyArray<StatusEntry>;
    };

export interface RuntimeSnapshot {
  readonly active: ReadonlyArray<StatusEntry>;
}

export interface TheseusRuntimeService {
  readonly submit: (command: RuntimeCommand) => Effect.Effect<RuntimeSubmission, RuntimeError>;
  readonly control: (command: RuntimeControl) => Effect.Effect<void, RuntimeError>;
  readonly query: (query: RuntimeQuery) => Effect.Effect<RuntimeQueryResult, RuntimeError>;
  readonly getSnapshot: () => Effect.Effect<RuntimeSnapshot>;
}

export class TheseusRuntime extends Context.Service<TheseusRuntime, TheseusRuntimeService>()(
  "TheseusRuntime",
) {}

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

export const TheseusRuntimeLive = Effect.gen(function* () {
  const registry = yield* DispatchRegistry;
  const toolCatalog = yield* ToolCatalog;
  const lm = yield* LanguageModel.LanguageModel;
  const ring = yield* Satellite.SatelliteRing;
  const store = yield* Dispatch.DispatchStore;
  const theseusDb = yield* TheseusDb;

  const startDispatch = ({
    spec: serializedSpec,
    task,
    continueFrom,
  }: StartDispatchInput): Effect.Effect<Stream.Stream<Dispatch.DispatchEvent>, RuntimeError> =>
    Effect.gen(function* () {
      const spec = yield* toolCatalog
        .hydrate(serializedSpec)
        .pipe(Effect.mapError((error) => new RuntimeToolNotFound({ names: error.names })));

      const options = continueFrom
        ? yield* store
            .restore(continueFrom)
            .pipe(
              Effect.flatMap((restored) =>
                restored
                  ? Effect.succeed(dispatchOptionsFromParent(restored, continueFrom, task))
                  : Effect.fail(new RuntimeNotFound({ kind: "dispatch", id: continueFrom })),
              ),
            )
        : undefined;

      const dbLayer = Layer.succeed(TheseusDb)(theseusDb);
      const currentCapsule = yield* Effect.provide(
        Effect.service(CapsuleNs.CurrentCapsule),
        Layer.provide(SqliteCurrentCapsuleLive(spec.name), dbLayer),
      );

      yield* currentCapsule.log({
        type: "dispatch.start",
        by: "runtime",
        data: { task, name: spec.name, continueFrom },
      });

      const depsLayer = Layer.mergeAll(
        Layer.succeed(LanguageModel.LanguageModel)(lm),
        Layer.succeed(Satellite.SatelliteRing)(ring),
        Layer.succeed(Dispatch.DispatchStore)(store),
        Layer.succeed(CapsuleNs.CurrentCapsule)(currentCapsule),
        Agent.AgentIdentityLive(spec.name),
      );

      const handle = yield* Effect.provide(Dispatch.dispatch(spec, task, options), depsLayer);
      yield* registry.register(handle, spec.name);

      yield* Effect.forkDetach({ startImmediately: true })(
        handle.result.pipe(
          Effect.exit,
          Effect.flatMap((exit) =>
            Exit.match(exit, {
              onSuccess: (result) =>
                Effect.gen(function* () {
                  yield* store.snapshot(handle.dispatchId, -1, result.messages, result.usage);
                  yield* currentCapsule.log({
                    type: "dispatch.done",
                    by: "runtime",
                    data: { dispatchId: handle.dispatchId, content: result.content },
                  });
                  yield* registry.updateStatus(handle.dispatchId, {
                    state: "done",
                    usage: result.usage,
                  });
                }),
              onFailure: (cause) =>
                Effect.gen(function* () {
                  const reason = reasonFromCause(cause);
                  yield* currentCapsule.log({
                    type: "dispatch.failed",
                    by: "runtime",
                    data: { dispatchId: handle.dispatchId, reason },
                  });
                  yield* registry.updateStatus(handle.dispatchId, { state: "failed" });
                }),
            }),
          ),
        ),
      );

      return handle.events.pipe(
        Stream.filter((event) => !SKIP_EVENT_TAGS.has(event._tag)),
        Stream.tap((event) =>
          event._tag === "Calling"
            ? registry.updateStatus(handle.dispatchId, { iteration: event.iteration })
            : Effect.void,
        ),
      );
    });

  const getHandle = (dispatchId: string): Effect.Effect<Dispatch.DispatchHandle, RuntimeNotFound> =>
    registry
      .get(dispatchId)
      .pipe(
        Effect.flatMap((handle) =>
          handle
            ? Effect.succeed(handle)
            : Effect.fail(new RuntimeNotFound({ kind: "dispatch", id: dispatchId })),
        ),
      );

  const listDispatches = (options?: {
    readonly limit?: number;
  }): Effect.Effect<ReadonlyArray<Dispatch.DispatchSummary>> => store.list(options);

  const getMessages = (
    dispatchId: string,
  ): Effect.Effect<ReadonlyArray<{ readonly role: string; readonly content: string }>> =>
    store.restore(dispatchId).pipe(
      Effect.map((restored) =>
        (restored?.messages ?? []).map((message) => ({
          role: String(message.role ?? ""),
          content:
            typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        })),
      ),
    );

  const inject = (dispatchId: string, text: string): Effect.Effect<void, RuntimeNotFound> =>
    getHandle(dispatchId).pipe(
      Effect.flatMap((handle) =>
        handle.inject({
          _tag: "AppendMessages",
          messages: [{ role: "user", content: text }],
        }),
      ),
    );

  const interrupt = (dispatchId: string): Effect.Effect<void, RuntimeNotFound> =>
    getHandle(dispatchId).pipe(Effect.flatMap((handle) => handle.interrupt));

  const getResult = (
    dispatchId: string,
  ): Effect.Effect<Dispatch.DispatchOutput, RuntimeNotFound | RuntimeDispatchFailed> =>
    getHandle(dispatchId).pipe(
      Effect.flatMap((handle) =>
        handle.result.pipe(
          Effect.catch((cause: Dispatch.DispatchError) =>
            Effect.fail(
              new RuntimeDispatchFailed({
                id: dispatchId,
                reason:
                  typeof cause === "object" && cause !== null && "_tag" in cause
                    ? String(cause._tag)
                    : "unknown",
                cause,
              }),
            ),
          ),
        ),
      ),
    );

  const getCapsuleEvents = (
    capsuleId: string,
  ): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>> =>
    Effect.sync(() => {
      const rows = theseusDb.db
        .prepare(
          "SELECT type, at, by, data_json FROM capsule_events WHERE capsule_id = ? ORDER BY id",
        )
        .all(capsuleId) as Array<{ type: string; at: string; by: string; data_json: string }>;
      return rows.map((row) => ({
        type: row.type,
        at: row.at,
        by: row.by,
        data: JSON.parse(row.data_json),
      }));
    });

  return TheseusRuntime.of({
    submit: (command) => {
      switch (command._tag) {
        case "DispatchStart":
          return startDispatch(command.input).pipe(
            Effect.map((events): RuntimeSubmission => ({ _tag: "DispatchStarted", events })),
          );
      }
    },

    control: (command) => {
      switch (command._tag) {
        case "DispatchInject":
          return inject(command.dispatchId, command.text);
        case "DispatchInterrupt":
          return interrupt(command.dispatchId);
      }
    },

    query: (query) => {
      switch (query._tag) {
        case "DispatchList":
          return listDispatches(query.options).pipe(
            Effect.map((dispatches): RuntimeQueryResult => ({ _tag: "DispatchList", dispatches })),
          );
        case "DispatchMessages":
          return getMessages(query.dispatchId).pipe(
            Effect.map((messages): RuntimeQueryResult => ({ _tag: "DispatchMessages", messages })),
          );
        case "DispatchResult":
          return getResult(query.dispatchId).pipe(
            Effect.map((result): RuntimeQueryResult => ({ _tag: "DispatchResult", result })),
          );
        case "CapsuleEvents":
          return getCapsuleEvents(query.capsuleId).pipe(
            Effect.map((events): RuntimeQueryResult => ({ _tag: "CapsuleEvents", events })),
          );
        case "ActiveStatus":
          return registry
            .list()
            .pipe(Effect.map((status): RuntimeQueryResult => ({ _tag: "ActiveStatus", status })));
      }
    },

    getSnapshot: () => registry.list().pipe(Effect.map((active): RuntimeSnapshot => ({ active }))),
  });
});

export const RuntimeCommands = {
  startDispatch: (
    runtime: TheseusRuntimeService,
    input: StartDispatchInput,
  ): Effect.Effect<Stream.Stream<Dispatch.DispatchEvent>, RuntimeError> =>
    runtime.submit({ _tag: "DispatchStart", input }).pipe(Effect.map((result) => result.events)),
} as const;

export const RuntimeControls = {
  inject: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
    text: string,
  ): Effect.Effect<void, RuntimeError> =>
    runtime.control({ _tag: "DispatchInject", dispatchId, text }),

  interrupt: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<void, RuntimeError> =>
    runtime.control({ _tag: "DispatchInterrupt", dispatchId }),
} as const;

export const RuntimeQueries = {
  listDispatches: (
    runtime: TheseusRuntimeService,
    options?: { readonly limit?: number },
  ): Effect.Effect<ReadonlyArray<Dispatch.DispatchSummary>, RuntimeError> =>
    runtime
      .query(options === undefined ? { _tag: "DispatchList" } : { _tag: "DispatchList", options })
      .pipe(
        Effect.flatMap((result) =>
          result._tag === "DispatchList"
            ? Effect.succeed(result.dispatches)
            : Effect.die("Runtime query returned unexpected result"),
        ),
      ),

  getMessages: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<
    ReadonlyArray<{ readonly role: string; readonly content: string }>,
    RuntimeError
  > =>
    runtime
      .query({ _tag: "DispatchMessages", dispatchId })
      .pipe(
        Effect.flatMap((result) =>
          result._tag === "DispatchMessages"
            ? Effect.succeed(result.messages)
            : Effect.die("Runtime query returned unexpected result"),
        ),
      ),

  getResult: (
    runtime: TheseusRuntimeService,
    dispatchId: string,
  ): Effect.Effect<Dispatch.DispatchOutput, RuntimeError> =>
    runtime
      .query({ _tag: "DispatchResult", dispatchId })
      .pipe(
        Effect.flatMap((result) =>
          result._tag === "DispatchResult"
            ? Effect.succeed(result.result)
            : Effect.die("Runtime query returned unexpected result"),
        ),
      ),

  getCapsuleEvents: (
    runtime: TheseusRuntimeService,
    capsuleId: string,
  ): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeError> =>
    runtime
      .query({ _tag: "CapsuleEvents", capsuleId })
      .pipe(
        Effect.flatMap((result) =>
          result._tag === "CapsuleEvents"
            ? Effect.succeed(result.events)
            : Effect.die("Runtime query returned unexpected result"),
        ),
      ),

  status: (
    runtime: TheseusRuntimeService,
  ): Effect.Effect<ReadonlyArray<StatusEntry>, RuntimeError> =>
    runtime
      .query({ _tag: "ActiveStatus" })
      .pipe(
        Effect.flatMap((result) =>
          result._tag === "ActiveStatus"
            ? Effect.succeed(result.status)
            : Effect.die("Runtime query returned unexpected result"),
        ),
      ),
} as const;
