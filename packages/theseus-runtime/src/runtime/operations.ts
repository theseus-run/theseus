import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect, Match } from "effect";
import { decodeJson } from "../json.ts";
import type { DispatchRegistry } from "../registry.ts";
import type { TheseusDb } from "../store/sqlite.ts";
import {
  getDispatchSessionLink,
  getDispatchSessionLinks,
  listMissionSessions,
  readMissionSession,
  toDispatchSession,
} from "./projections/session/store.ts";
import {
  type MissionSession,
  type RuntimeControl,
  RuntimeDispatchFailed,
  RuntimeNotFound,
  type RuntimeQuery,
  type RuntimeQueryResult,
  type StatusEntry,
} from "./types.ts";

export interface RuntimeOperationsDeps {
  readonly registry: (typeof DispatchRegistry)["Service"];
  readonly dispatchStore: (typeof Dispatch.DispatchStore)["Service"];
  readonly db: (typeof TheseusDb)["Service"];
}

const getHandle = (
  registry: (typeof DispatchRegistry)["Service"],
  dispatchId: string,
): Effect.Effect<Dispatch.DispatchHandle, RuntimeNotFound> =>
  registry
    .get(dispatchId)
    .pipe(
      Effect.flatMap((handle) =>
        handle
          ? Effect.succeed(handle)
          : Effect.fail(new RuntimeNotFound({ kind: "dispatch", id: dispatchId })),
      ),
    );

const dispatchMessages = (
  store: (typeof Dispatch.DispatchStore)["Service"],
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

const dispatchFailureReason = (cause: Dispatch.DispatchError): string =>
  typeof cause === "object" && cause !== null && "_tag" in cause ? String(cause._tag) : "unknown";

const persistedDispatchResult = (
  store: (typeof Dispatch.DispatchStore)["Service"],
  dispatchId: string,
): Effect.Effect<Dispatch.DispatchOutput, RuntimeNotFound | RuntimeDispatchFailed> =>
  Effect.gen(function* () {
    const entries = yield* store.events(dispatchId);
    const terminal = [...entries]
      .reverse()
      .find((entry) => entry.event._tag === "Done" || entry.event._tag === "Failed");
    if (terminal?.event._tag === "Done") return terminal.event.result;
    if (terminal?.event._tag === "Failed") {
      return yield* new RuntimeDispatchFailed({ id: dispatchId, reason: terminal.event.reason });
    }
    return yield* new RuntimeNotFound({ kind: "dispatch", id: dispatchId });
  });

const dispatchResult = (
  deps: RuntimeOperationsDeps,
  dispatchId: string,
): Effect.Effect<Dispatch.DispatchOutput, RuntimeNotFound | RuntimeDispatchFailed> =>
  deps.registry.get(dispatchId).pipe(
    Effect.flatMap((handle) =>
      handle
        ? handle.result.pipe(
            Effect.mapError(
              (cause: Dispatch.DispatchError) =>
                new RuntimeDispatchFailed({
                  id: dispatchId,
                  reason: dispatchFailureReason(cause),
                  cause,
                }),
            ),
          )
        : persistedDispatchResult(deps.dispatchStore, dispatchId),
    ),
  );

const capsuleEvents = (
  db: (typeof TheseusDb)["Service"],
  capsuleId: string,
): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>> =>
  Effect.sync(() => {
    const rows = db.db
      .prepare(
        "SELECT type, at, by, data_json FROM capsule_events WHERE capsule_id = ? ORDER BY id",
      )
      .all(capsuleId) as Array<{ type: string; at: string; by: string; data_json: string }>;
    return rows.map((row) => ({
      type: row.type,
      at: row.at,
      by: row.by,
      data: decodeJson(row.data_json),
    }));
  });

const dispatchCapsuleEvents = (
  db: (typeof TheseusDb)["Service"],
  dispatchId: string,
): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeNotFound> =>
  getDispatchSessionLink(db, dispatchId).pipe(
    Effect.flatMap((link) =>
      link
        ? capsuleEvents(db, link.capsuleId)
        : Effect.fail(new RuntimeNotFound({ kind: "dispatch", id: dispatchId })),
    ),
  );

const dispatchList = (
  deps: RuntimeOperationsDeps,
  options?: { readonly limit?: number },
): Effect.Effect<ReadonlyArray<StatusEntry>> =>
  Effect.gen(function* () {
    const summaries = yield* deps.dispatchStore.list(options);
    const links = yield* getDispatchSessionLinks(deps.db);
    return summaries.flatMap((summary) => {
      const link = links.get(summary.dispatchId);
      return link ? [toDispatchSession(summary, link)] : [];
    });
  });

export const runRuntimeControl = (
  deps: RuntimeOperationsDeps,
  command: RuntimeControl,
): Effect.Effect<void, RuntimeNotFound> =>
  Match.value(command).pipe(
    Match.tag("DispatchInject", ({ dispatchId, text }) =>
      getHandle(deps.registry, dispatchId).pipe(
        Effect.flatMap((handle) =>
          handle.inject({
            _tag: "AppendMessages",
            messages: [{ role: "user", content: text }],
          }),
        ),
      ),
    ),
    Match.tag("DispatchInterrupt", ({ dispatchId }) =>
      getHandle(deps.registry, dispatchId).pipe(Effect.flatMap((handle) => handle.interrupt)),
    ),
    Match.exhaustive,
  );

export const runRuntimeQuery = (
  deps: RuntimeOperationsDeps,
  query: RuntimeQuery,
): Effect.Effect<RuntimeQueryResult, RuntimeNotFound | RuntimeDispatchFailed> =>
  Match.value(query).pipe(
    Match.tag("MissionList", () =>
      listMissionSessions(deps.db).pipe(
        Effect.map((missions): RuntimeQueryResult => ({ _tag: "MissionList", missions })),
      ),
    ),
    Match.tag("MissionGet", ({ missionId }) =>
      readMissionSession(deps.db, missionId).pipe(
        Effect.flatMap((mission) =>
          mission
            ? Effect.succeed({ _tag: "MissionGet", mission } satisfies RuntimeQueryResult)
            : Effect.fail(new RuntimeNotFound({ kind: "mission", id: missionId })),
        ),
      ),
    ),
    Match.tag("DispatchList", ({ options }) =>
      dispatchList(deps, options).pipe(
        Effect.map((dispatches): RuntimeQueryResult => ({ _tag: "DispatchList", dispatches })),
      ),
    ),
    Match.tag("DispatchMessages", ({ dispatchId }) =>
      dispatchMessages(deps.dispatchStore, dispatchId).pipe(
        Effect.map((messages): RuntimeQueryResult => ({ _tag: "DispatchMessages", messages })),
      ),
    ),
    Match.tag("DispatchResult", ({ dispatchId }) =>
      dispatchResult(deps, dispatchId).pipe(
        Effect.map((result): RuntimeQueryResult => ({ _tag: "DispatchResult", result })),
      ),
    ),
    Match.tag("CapsuleEvents", ({ capsuleId }) =>
      capsuleEvents(deps.db, capsuleId).pipe(
        Effect.map((events): RuntimeQueryResult => ({ _tag: "CapsuleEvents", events })),
      ),
    ),
    Match.tag("DispatchCapsuleEvents", ({ dispatchId }) =>
      dispatchCapsuleEvents(deps.db, dispatchId).pipe(
        Effect.map((events): RuntimeQueryResult => ({ _tag: "DispatchCapsuleEvents", events })),
      ),
    ),
    Match.tag("ActiveStatus", () =>
      deps.registry
        .list()
        .pipe(Effect.map((status): RuntimeQueryResult => ({ _tag: "ActiveStatus", status }))),
    ),
    Match.exhaustive,
  );

export const snapshot = (
  deps: RuntimeOperationsDeps,
): Effect.Effect<{
  readonly missions: ReadonlyArray<MissionSession>;
  readonly active: ReadonlyArray<StatusEntry>;
}> =>
  Effect.gen(function* () {
    const missions = yield* listMissionSessions(deps.db);
    const active = yield* deps.registry.list();
    return { missions, active };
  });
