import type { SqliteClient } from "@effect/sql-sqlite-bun";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import * as Mission from "@theseus.run/core/Mission";
import { Effect, Layer } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";
import { TheseusDb } from "../../../store/sqlite.ts";
import { SqliteCurrentCapsuleLive } from "../../../store/sqlite-capsule.ts";
import { recordMissionCapsule } from "../../projections/session/store.ts";
import type { MissionCreateInput, MissionSession } from "../../types.ts";

const makeCurrentCapsule = (
  db: (typeof TheseusDb)["Service"],
  slug: string,
): Effect.Effect<CapsuleNs.CapsuleRecord> => {
  const dbLayer = Layer.succeed(TheseusDb)(db);
  return Effect.provide(
    Effect.service(CapsuleNs.CurrentCapsule),
    Layer.provide(SqliteCurrentCapsuleLive(slug), dbLayer),
  );
};

export const createMission = (
  db: (typeof TheseusDb)["Service"],
  sql: (typeof SqliteClient.SqliteClient)["Service"],
  input: MissionCreateInput,
): Effect.Effect<MissionSession, SqlError> =>
  Effect.gen(function* () {
    const missionId = yield* Mission.makeMissionId(input.slug);
    const capsule = yield* makeCurrentCapsule(db, input.slug ?? "mission");
    yield* Mission.makeMissionRecord({
      id: missionId,
      goal: input.goal,
      criteria: input.criteria,
    }).pipe(Effect.provideService(CapsuleNs.CurrentCapsule, capsule));
    yield* recordMissionCapsule(sql, missionId, capsule.id);
    return {
      missionId,
      capsuleId: capsule.id,
      goal: input.goal,
      criteria: input.criteria,
      state: "pending",
    };
  });
