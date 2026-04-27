import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect } from "effect";
import { decodeJson } from "../../../json.ts";
import type { TheseusDb } from "../../../store/sqlite.ts";
import type { DispatchSession, MissionSession, MissionSessionState } from "../../types.ts";

const emptyUsage: Dispatch.Usage = { inputTokens: 0, outputTokens: 0 };

interface MissionCreateData {
  readonly id?: string;
  readonly goal?: string;
  readonly criteria?: ReadonlyArray<string>;
}

interface MissionTransitionData {
  readonly to?: MissionSessionState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const missionCreateData = (data: unknown): MissionCreateData | undefined => {
  if (!isRecord(data)) return undefined;
  const id = typeof data["id"] === "string" ? data["id"] : undefined;
  const goal = typeof data["goal"] === "string" ? data["goal"] : undefined;
  const criteria = Array.isArray(data["criteria"])
    ? data["criteria"].filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    ...(id !== undefined ? { id } : {}),
    ...(goal !== undefined ? { goal } : {}),
    ...(criteria !== undefined ? { criteria } : {}),
  };
};

const missionTransitionData = (data: unknown): MissionTransitionData | undefined => {
  if (!isRecord(data)) return undefined;
  const to = data["to"];
  return to === "pending" || to === "running" || to === "done" || to === "failed"
    ? { to }
    : undefined;
};

const deriveMissionSession = (
  capsuleId: string,
  events: ReadonlyArray<CapsuleNs.CapsuleEvent>,
): MissionSession | undefined => {
  const create = events.find((event) => event.type === "mission.create");
  if (create === undefined) return undefined;
  const createData = missionCreateData(create.data);
  if (
    createData?.id === undefined ||
    createData.goal === undefined ||
    createData.criteria === undefined
  ) {
    return undefined;
  }

  const state = events.reduce<MissionSessionState>((current, event) => {
    if (event.type !== "mission.transition") return current;
    return missionTransitionData(event.data)?.to ?? current;
  }, "pending");

  return {
    missionId: createData.id,
    capsuleId,
    goal: createData.goal,
    criteria: createData.criteria,
    state,
  };
};

export const recordMissionCapsule = (
  db: (typeof TheseusDb)["Service"],
  missionId: string,
  capsuleId: string,
): Effect.Effect<void> =>
  Effect.sync(() => {
    db.db
      .prepare(
        "INSERT INTO runtime_mission_capsules (mission_id, capsule_id) VALUES (?, ?) ON CONFLICT(mission_id) DO UPDATE SET capsule_id = excluded.capsule_id",
      )
      .run(missionId, capsuleId);
  });

export const recordDispatchSession = (
  db: (typeof TheseusDb)["Service"],
  session: Pick<DispatchSession, "dispatchId" | "missionId" | "capsuleId">,
): Effect.Effect<void> =>
  Effect.sync(() => {
    db.db
      .prepare(
        "INSERT INTO runtime_dispatch_sessions (dispatch_id, mission_id, capsule_id) VALUES (?, ?, ?) ON CONFLICT(dispatch_id) DO UPDATE SET mission_id = excluded.mission_id, capsule_id = excluded.capsule_id",
      )
      .run(session.dispatchId, session.missionId, session.capsuleId);
  });

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

export const getDispatchSessionLink = (
  db: (typeof TheseusDb)["Service"],
  dispatchId: string,
): Effect.Effect<{ readonly missionId: string; readonly capsuleId: string } | undefined> =>
  Effect.sync(() => {
    const row = db.db
      .prepare("SELECT mission_id, capsule_id FROM runtime_dispatch_sessions WHERE dispatch_id = ?")
      .get(dispatchId) as { mission_id: string; capsule_id: string } | null;
    return row ? { missionId: row.mission_id, capsuleId: row.capsule_id } : undefined;
  });

export const getDispatchSessionLinks = (
  db: (typeof TheseusDb)["Service"],
): Effect.Effect<ReadonlyMap<string, { readonly missionId: string; readonly capsuleId: string }>> =>
  Effect.sync(() => {
    const rows = db.db
      .prepare("SELECT dispatch_id, mission_id, capsule_id FROM runtime_dispatch_sessions")
      .all() as Array<{ dispatch_id: string; mission_id: string; capsule_id: string }>;
    return new Map(
      rows.map((row) => [
        row.dispatch_id,
        { missionId: row.mission_id, capsuleId: row.capsule_id },
      ]),
    );
  });

export const readMissionSession = (
  db: (typeof TheseusDb)["Service"],
  missionId: string,
): Effect.Effect<MissionSession | undefined> =>
  Effect.sync(() => {
    const link = db.db
      .prepare("SELECT capsule_id FROM runtime_mission_capsules WHERE mission_id = ?")
      .get(missionId) as { capsule_id: string } | null;
    if (!link) return undefined;
    const rows = db.db
      .prepare(
        "SELECT type, at, by, data_json FROM capsule_events WHERE capsule_id = ? ORDER BY id",
      )
      .all(link.capsule_id) as Array<{
      type: string;
      at: string;
      by: string;
      data_json: string;
    }>;
    return deriveMissionSession(
      link.capsule_id,
      rows.map((row) => ({
        type: row.type,
        at: row.at,
        by: row.by,
        data: decodeJson(row.data_json),
      })),
    );
  });

export const listMissionSessions = (
  db: (typeof TheseusDb)["Service"],
): Effect.Effect<ReadonlyArray<MissionSession>> =>
  Effect.sync(() => {
    const links = db.db
      .prepare("SELECT mission_id, capsule_id FROM runtime_mission_capsules")
      .all() as Array<{ mission_id: string; capsule_id: string }>;
    return links.flatMap((link) => {
      const rows = db.db
        .prepare(
          "SELECT type, at, by, data_json FROM capsule_events WHERE capsule_id = ? ORDER BY id",
        )
        .all(link.capsule_id) as Array<{
        type: string;
        at: string;
        by: string;
        data_json: string;
      }>;
      const session = deriveMissionSession(
        link.capsule_id,
        rows.map((row) => ({
          type: row.type,
          at: row.at,
          by: row.by,
          data: decodeJson(row.data_json),
        })),
      );
      return session ? [session] : [];
    });
  });

export const toDispatchSession = (
  summary: Dispatch.DispatchSummary,
  link: { readonly missionId: string; readonly capsuleId: string },
): DispatchSession => ({
  dispatchId: summary.dispatchId,
  ...(summary.parentDispatchId !== undefined ? { parentDispatchId: summary.parentDispatchId } : {}),
  missionId: link.missionId,
  capsuleId: link.capsuleId,
  name: summary.name,
  ...(summary.modelRequest !== undefined ? { modelRequest: summary.modelRequest } : {}),
  iteration: 0,
  state: summary.status,
  usage: summary.usage ?? emptyUsage,
});
