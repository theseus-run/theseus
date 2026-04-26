import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect, Match } from "effect";
import type { DispatchRegistry, StatusEntry } from "../registry.ts";
import type { TheseusDb } from "../store/sqlite.ts";
import {
  type RuntimeControl,
  RuntimeDispatchFailed,
  RuntimeNotFound,
  type RuntimeQuery,
  type RuntimeQueryResult,
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

const dispatchResult = (
  registry: (typeof DispatchRegistry)["Service"],
  dispatchId: string,
): Effect.Effect<Dispatch.DispatchOutput, RuntimeNotFound | RuntimeDispatchFailed> =>
  getHandle(registry, dispatchId).pipe(
    Effect.flatMap((handle) =>
      handle.result.pipe(
        Effect.mapError(
          (cause: Dispatch.DispatchError) =>
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
      data: JSON.parse(row.data_json),
    }));
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
    Match.tag("DispatchList", ({ options }) =>
      deps.dispatchStore
        .list(options)
        .pipe(
          Effect.map((dispatches): RuntimeQueryResult => ({ _tag: "DispatchList", dispatches })),
        ),
    ),
    Match.tag("DispatchMessages", ({ dispatchId }) =>
      dispatchMessages(deps.dispatchStore, dispatchId).pipe(
        Effect.map((messages): RuntimeQueryResult => ({ _tag: "DispatchMessages", messages })),
      ),
    ),
    Match.tag("DispatchResult", ({ dispatchId }) =>
      dispatchResult(deps.registry, dispatchId).pipe(
        Effect.map((result): RuntimeQueryResult => ({ _tag: "DispatchResult", result })),
      ),
    ),
    Match.tag("CapsuleEvents", ({ capsuleId }) =>
      capsuleEvents(deps.db, capsuleId).pipe(
        Effect.map((events): RuntimeQueryResult => ({ _tag: "CapsuleEvents", events })),
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
  registry: (typeof DispatchRegistry)["Service"],
): Effect.Effect<{ readonly active: ReadonlyArray<StatusEntry> }> =>
  registry.list().pipe(Effect.map((active) => ({ active })));
