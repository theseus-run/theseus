import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect } from "effect";
import { decodeJson, encodeJson } from "../../../json.ts";
import type { TheseusDb } from "../../../store/sqlite.ts";
import type {
  DispatchSession,
  WorkNodeKind,
  WorkNodeRelation,
  WorkNodeSession,
  WorkNodeState,
} from "../../types.ts";

const emptyUsage: Dispatch.Usage = { inputTokens: 0, outputTokens: 0 };

export interface WorkNodeCreate {
  readonly workNodeId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parentWorkNodeId?: string;
  readonly kind: WorkNodeKind;
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly dispatchId?: string;
  readonly modelRequest?: Dispatch.ModelRequest;
  readonly startedAt?: number;
}

interface WorkNodeRow {
  readonly work_node_id: string;
  readonly mission_id: string;
  readonly capsule_id: string;
  readonly parent_work_node_id: string | null;
  readonly kind: WorkNodeKind;
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly state: WorkNodeState;
  readonly started_at: number | null;
  readonly completed_at: number | null;
  readonly dispatch_id: string | null;
  readonly model_request_json: string | null;
  readonly iteration: number;
  readonly usage_json: string;
}

const decodeModelRequest = (json: string | null): Dispatch.ModelRequest | undefined =>
  json === null ? undefined : (decodeJson(json) as Dispatch.ModelRequest);

const decodeUsage = (json: string): Dispatch.Usage => decodeJson(json) as Dispatch.Usage;

const toWorkNodeSession = (row: WorkNodeRow): WorkNodeSession => ({
  workNodeId: row.work_node_id,
  missionId: row.mission_id,
  capsuleId: row.capsule_id,
  ...(row.parent_work_node_id !== null ? { parentWorkNodeId: row.parent_work_node_id } : {}),
  kind: row.kind,
  relation: row.relation,
  label: row.label,
  state: row.state,
  ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
  ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
});

export const toDispatchSession = (row: WorkNodeRow): DispatchSession | undefined => {
  if (row.kind !== "dispatch" || row.dispatch_id === null) return undefined;
  const modelRequest = decodeModelRequest(row.model_request_json);
  return {
    ...toWorkNodeSession(row),
    kind: "dispatch",
    dispatchId: row.dispatch_id,
    name: row.label,
    ...(modelRequest !== undefined ? { modelRequest } : {}),
    iteration: row.iteration,
    state: row.state === "pending" ? "running" : row.state,
    usage: decodeUsage(row.usage_json),
  };
};

export const recordWorkNode = (
  db: (typeof TheseusDb)["Service"],
  node: WorkNodeCreate,
): Effect.Effect<void> =>
  Effect.sync(() => {
    db.db
      .prepare(
        `INSERT INTO runtime_work_nodes (
          work_node_id,
          mission_id,
          capsule_id,
          parent_work_node_id,
          kind,
          relation,
          label,
          state,
          started_at,
          completed_at,
          dispatch_id,
          model_request_json,
          iteration,
          usage_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, NULL, ?, ?, 0, ?)
        ON CONFLICT(work_node_id) DO UPDATE SET
          mission_id = excluded.mission_id,
          capsule_id = excluded.capsule_id,
          parent_work_node_id = excluded.parent_work_node_id,
          kind = excluded.kind,
          relation = excluded.relation,
          label = excluded.label,
          state = excluded.state,
          started_at = excluded.started_at,
          dispatch_id = excluded.dispatch_id,
          model_request_json = excluded.model_request_json`,
      )
      .run(
        node.workNodeId,
        node.missionId,
        node.capsuleId,
        node.parentWorkNodeId ?? null,
        node.kind,
        node.relation,
        node.label,
        node.startedAt ?? null,
        node.dispatchId ?? null,
        node.modelRequest === undefined ? null : encodeJson(node.modelRequest),
        encodeJson(emptyUsage),
      );
  });

export const updateWorkNodeDispatchStatus = (
  db: (typeof TheseusDb)["Service"],
  input: {
    readonly dispatchId: string;
    readonly state?: WorkNodeState;
    readonly iteration?: number;
    readonly usage?: Dispatch.Usage;
    readonly completedAt?: number;
  },
): Effect.Effect<void> =>
  Effect.sync(() => {
    const assignments: string[] = [];
    const values: Array<string | number> = [];
    if (input.state !== undefined) {
      assignments.push("state = ?");
      values.push(input.state);
    }
    if (input.iteration !== undefined) {
      assignments.push("iteration = ?");
      values.push(input.iteration);
    }
    if (input.usage !== undefined) {
      assignments.push("usage_json = ?");
      values.push(encodeJson(input.usage));
    }
    if (input.completedAt !== undefined) {
      assignments.push("completed_at = ?");
      values.push(input.completedAt);
    }
    if (assignments.length === 0) return;
    values.push(input.dispatchId);
    db.db
      .prepare(`UPDATE runtime_work_nodes SET ${assignments.join(", ")} WHERE dispatch_id = ?`)
      .run(...values);
  });

export const getDispatchWorkNode = (
  db: (typeof TheseusDb)["Service"],
  dispatchId: string,
): Effect.Effect<DispatchSession | undefined> =>
  Effect.sync(() => {
    const row = db.db
      .prepare("SELECT * FROM runtime_work_nodes WHERE dispatch_id = ?")
      .get(dispatchId) as WorkNodeRow | null;
    return row === null ? undefined : toDispatchSession(row);
  });

export const listWorkNodes = (
  db: (typeof TheseusDb)["Service"],
  options?: { readonly missionId?: string; readonly limit?: number },
): Effect.Effect<ReadonlyArray<WorkNodeSession>> =>
  Effect.sync(() => {
    const limit = options?.limit ?? 100;
    const rows =
      options?.missionId === undefined
        ? (db.db
            .prepare("SELECT * FROM runtime_work_nodes ORDER BY started_at DESC LIMIT ?")
            .all(limit) as WorkNodeRow[])
        : (db.db
            .prepare(
              "SELECT * FROM runtime_work_nodes WHERE mission_id = ? ORDER BY started_at ASC LIMIT ?",
            )
            .all(options.missionId, limit) as WorkNodeRow[]);
    return rows.map(toWorkNodeSession);
  });

export const listDispatchSessions = (
  db: (typeof TheseusDb)["Service"],
  options?: { readonly limit?: number },
): Effect.Effect<ReadonlyArray<DispatchSession>> =>
  Effect.sync(() => {
    const rows = db.db
      .prepare(
        "SELECT * FROM runtime_work_nodes WHERE kind = 'dispatch' ORDER BY started_at DESC LIMIT ?",
      )
      .all(options?.limit ?? 100) as WorkNodeRow[];
    return rows.flatMap((row) => {
      const session = toDispatchSession(row);
      return session === undefined ? [] : [session];
    });
  });
