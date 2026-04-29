import type { SqliteClient } from "@effect/sql-sqlite-bun";
import type * as CapsuleNs from "@theseus.run/core/Capsule";
import { Effect, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { TheseusDb } from "../../../store/sqlite.ts";
import {
  type MissionSession,
  type MissionSessionState,
  RuntimeProjectionDecodeFailed,
} from "../../types.ts";

const MissionCreateDataSchema = Schema.Struct({
  id: Schema.String,
  goal: Schema.String,
  criteria: Schema.Array(Schema.String),
});

const MissionTransitionDataSchema = Schema.Struct({
  to: Schema.Literals(["pending", "running", "done", "failed"]),
});

const CapsuleEventRowSchema = Schema.Struct({
  type: Schema.String,
  at: Schema.String,
  by: Schema.String,
  data_json: Schema.String,
});

type CapsuleEventRow = Schema.Schema.Type<typeof CapsuleEventRowSchema>;

const projectionDecodeError = (source: string, cause: unknown): RuntimeProjectionDecodeFailed =>
  new RuntimeProjectionDecodeFailed({
    source,
    reason: String(cause),
    cause,
  });

const decodeProjection = <S extends Schema.Top>(
  source: string,
  schema: S,
  value: unknown,
): Effect.Effect<Schema.Schema.Type<S>, RuntimeProjectionDecodeFailed> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => projectionDecodeError(source, cause)),
  ) as Effect.Effect<Schema.Schema.Type<S>, RuntimeProjectionDecodeFailed>;

const decodeJsonProjection = <S extends Schema.Top>(
  source: string,
  schema: S,
  json: string,
): Effect.Effect<Schema.Schema.Type<S>, RuntimeProjectionDecodeFailed> =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(json).pipe(
    Effect.flatMap((value) => decodeProjection(source, schema, value)),
    Effect.mapError((cause) => projectionDecodeError(source, cause)),
  ) as Effect.Effect<Schema.Schema.Type<S>, RuntimeProjectionDecodeFailed>;

const decodeCapsuleRows = (
  rows: ReadonlyArray<unknown>,
): Effect.Effect<ReadonlyArray<CapsuleEventRow>, RuntimeProjectionDecodeFailed> =>
  Effect.forEach(rows, (row) =>
    decodeProjection("capsule_events mission projection row", CapsuleEventRowSchema, row),
  );

const decodeCapsuleEvents = (
  rows: ReadonlyArray<unknown>,
): Effect.Effect<ReadonlyArray<CapsuleNs.CapsuleEvent>, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const decodedRows = yield* decodeCapsuleRows(rows);
    return yield* Effect.forEach(decodedRows, (row) =>
      decodeJsonProjection("capsule_events.data_json", Schema.Unknown, row.data_json).pipe(
        Effect.map((data) => ({
          type: row.type,
          at: row.at,
          by: row.by,
          data,
        })),
      ),
    );
  });

const deriveMissionSession = (
  capsuleId: string,
  events: ReadonlyArray<CapsuleNs.CapsuleEvent>,
): Effect.Effect<MissionSession | undefined, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const create = events.find((event) => event.type === "mission.create");
    if (create === undefined) return undefined;

    const createData = yield* decodeProjection(
      "mission.create capsule payload",
      MissionCreateDataSchema,
      create.data,
    );

    let state: MissionSessionState = "pending";
    for (const event of events) {
      if (event.type === "mission.transition") {
        const transition = yield* decodeProjection(
          "mission.transition capsule payload",
          MissionTransitionDataSchema,
          event.data,
        );
        state = transition.to;
      }
    }

    return {
      missionId: createData.id,
      capsuleId,
      goal: createData.goal,
      criteria: createData.criteria,
      state,
    };
  });

const readCapsuleEventRows = (
  db: (typeof TheseusDb)["Service"],
  capsuleId: string,
): Effect.Effect<ReadonlyArray<unknown>> =>
  Effect.sync(() =>
    db.db
      .prepare(
        "SELECT type, at, by, data_json FROM capsule_events WHERE capsule_id = ? ORDER BY id",
      )
      .all(capsuleId),
  );

const readSessionFromCapsule = (
  db: (typeof TheseusDb)["Service"],
  capsuleId: string,
): Effect.Effect<MissionSession | undefined, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const rows = yield* readCapsuleEventRows(db, capsuleId);
    return yield* deriveMissionSession(capsuleId, yield* decodeCapsuleEvents(rows));
  });

export const recordMissionCapsule = (
  sql: (typeof SqliteClient.SqliteClient)["Service"],
  missionId: string,
  capsuleId: string,
): Effect.Effect<void, SqlError> =>
  sql`
    INSERT INTO runtime_mission_capsules (mission_id, capsule_id)
    VALUES (${missionId}, ${capsuleId})
    ON CONFLICT(mission_id) DO UPDATE SET capsule_id = excluded.capsule_id
  `.pipe(Effect.asVoid);

export const getMissionCapsuleId = (
  db: (typeof TheseusDb)["Service"],
  missionId: string,
): Effect.Effect<string | undefined> =>
  Effect.sync(() => {
    const row = db.db
      .prepare("SELECT capsule_id FROM runtime_mission_capsules WHERE mission_id = ?")
      .get(missionId) as { capsule_id: string } | null;
    return row?.capsule_id;
  });

export const readMissionSession = (
  db: (typeof TheseusDb)["Service"],
  missionId: string,
): Effect.Effect<MissionSession | undefined, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const link = yield* Effect.sync(
      () =>
        db.db
          .prepare("SELECT capsule_id FROM runtime_mission_capsules WHERE mission_id = ?")
          .get(missionId) as { capsule_id: string } | null,
    );
    return link === null ? undefined : yield* readSessionFromCapsule(db, link.capsule_id);
  });

export const listMissionSessions = (
  db: (typeof TheseusDb)["Service"],
): Effect.Effect<ReadonlyArray<MissionSession>, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const links = yield* Effect.sync(
      () =>
        db.db
          .prepare("SELECT mission_id, capsule_id FROM runtime_mission_capsules")
          .all() as Array<{
          mission_id: string;
          capsule_id: string;
        }>,
    );
    const sessions = yield* Effect.forEach(links, (link) =>
      readSessionFromCapsule(db, link.capsule_id),
    );
    return sessions.flatMap((session) => (session === undefined ? [] : [session]));
  });
