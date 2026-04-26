import * as CapsuleNs from "@theseus.run/core/Capsule";
import * as Mission from "@theseus.run/core/Mission";
import { Effect, Layer } from "effect";
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
  input: MissionCreateInput,
): Effect.Effect<MissionSession> =>
  Effect.gen(function* () {
    const missionId = yield* Mission.makeMissionId(input.slug);
    const capsule = yield* makeCurrentCapsule(db, input.slug ?? "mission");
    yield* Mission.makeMissionRecord({
      id: missionId,
      goal: input.goal,
      criteria: input.criteria,
    }).pipe(Effect.provideService(CapsuleNs.CurrentCapsule, capsule));
    yield* recordMissionCapsule(db, missionId, capsule.id);
    return {
      missionId,
      capsuleId: capsule.id,
      goal: input.goal,
      criteria: input.criteria,
      state: "pending",
    };
  });
