import * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect, Schema } from "effect";
import { encodeJson } from "../../../json.ts";
import type { TheseusDb } from "../../../store/sqlite.ts";
import type {
  DispatchSession,
  WorkNodeKind,
  WorkNodeRelation,
  WorkNodeSession,
  WorkNodeState,
} from "../../types.ts";
import { RuntimeProjectionDecodeFailed, WorkNodeId } from "../../types.ts";
import { WorkControlDescriptors } from "../../work-control.ts";

const emptyUsage: Dispatch.Usage = { inputTokens: 0, outputTokens: 0 };
const undefinedEffect = Effect.void as Effect.Effect<undefined>;

const nullable = <S extends Schema.Top>(schema: S) => Schema.NullOr(schema);

const WorkNodeKindSchema = Schema.Literals(["dispatch", "task", "external"]);
const WorkNodeRelationSchema = Schema.Literals(["root", "delegated", "continued", "branched"]);
const WorkNodeStateSchema = Schema.Literals([
  "pending",
  "running",
  "paused",
  "blocked",
  "done",
  "failed",
  "aborted",
]);

const ModelRequestSchema = Schema.Union([
  Schema.Struct({
    provider: Schema.Literal("openai"),
    model: Schema.String,
    maxOutputTokens: Schema.optional(nullable(Schema.Number)),
    reasoningEffort: Schema.optional(nullable(Schema.Literals(["low", "medium", "high", "xhigh"]))),
    textVerbosity: Schema.optional(nullable(Schema.Literals(["low", "medium", "high"]))),
  }),
  Schema.Struct({
    provider: Schema.Literal("copilot"),
    model: Schema.String,
    maxTokens: Schema.optional(nullable(Schema.Number)),
  }),
]);

const WorkNodeRowSchema = Schema.Struct({
  work_node_id: Schema.String,
  mission_id: Schema.String,
  capsule_id: Schema.String,
  parent_work_node_id: nullable(Schema.String),
  kind: WorkNodeKindSchema,
  relation: WorkNodeRelationSchema,
  label: Schema.String,
  state: WorkNodeStateSchema,
  started_at: nullable(Schema.Number),
  completed_at: nullable(Schema.Number),
  dispatch_id: nullable(Schema.String),
  model_request_json: nullable(Schema.String),
  iteration: Schema.Number,
  usage_json: Schema.String,
});

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

export interface WorkNodeCreate {
  readonly workNodeId: WorkNodeId;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parentWorkNodeId?: WorkNodeId;
  readonly kind: WorkNodeKind;
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly dispatchId?: string;
  readonly modelRequest?: Dispatch.ModelRequest;
  readonly startedAt?: number;
}

type WorkNodeRow = Schema.Schema.Type<typeof WorkNodeRowSchema>;
type ModelRequestWire = Schema.Schema.Type<typeof ModelRequestSchema>;

const decodeRow = (value: unknown): Effect.Effect<WorkNodeRow, RuntimeProjectionDecodeFailed> =>
  decodeProjection("runtime_work_nodes row", WorkNodeRowSchema, value);

const normalizeModelRequest = (request: ModelRequestWire): Dispatch.ModelRequest => {
  switch (request.provider) {
    case "openai":
      return {
        provider: "openai",
        model: request.model,
        ...(request.maxOutputTokens != null ? { maxOutputTokens: request.maxOutputTokens } : {}),
        ...(request.reasoningEffort != null ? { reasoningEffort: request.reasoningEffort } : {}),
        ...(request.textVerbosity != null ? { textVerbosity: request.textVerbosity } : {}),
      };
    case "copilot":
      return {
        provider: "copilot",
        model: request.model,
        ...(request.maxTokens != null ? { maxTokens: request.maxTokens } : {}),
      };
  }
};

const decodeModelRequest = (
  json: string | null,
): Effect.Effect<Dispatch.ModelRequest | undefined, RuntimeProjectionDecodeFailed> =>
  json === null
    ? undefinedEffect
    : decodeJsonProjection("runtime_work_nodes.model_request_json", ModelRequestSchema, json).pipe(
        Effect.map(normalizeModelRequest),
      );

const decodeUsage = (json: string): Effect.Effect<Dispatch.Usage, RuntimeProjectionDecodeFailed> =>
  decodeJsonProjection("runtime_work_nodes.usage_json", Dispatch.UsageSchema, json);

const toWorkNodeSession = (row: WorkNodeRow): WorkNodeSession => ({
  workNodeId: WorkNodeId.make(row.work_node_id),
  missionId: row.mission_id,
  capsuleId: row.capsule_id,
  ...(row.parent_work_node_id !== null
    ? { parentWorkNodeId: WorkNodeId.make(row.parent_work_node_id) }
    : {}),
  kind: row.kind,
  relation: row.relation,
  label: row.label,
  state: row.state,
  control:
    row.kind === "dispatch"
      ? WorkControlDescriptors.dispatch(row.state)
      : WorkControlDescriptors.unsupported(row.kind),
  ...(row.started_at !== null ? { startedAt: row.started_at } : {}),
  ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
});

export const toDispatchSession = (
  row: WorkNodeRow,
): Effect.Effect<DispatchSession | undefined, RuntimeProjectionDecodeFailed> => {
  if (row.kind !== "dispatch" || row.dispatch_id === null) return undefinedEffect;
  const dispatchId = row.dispatch_id;
  return Effect.gen(function* () {
    const modelRequest = yield* decodeModelRequest(row.model_request_json);
    return {
      ...toWorkNodeSession(row),
      kind: "dispatch",
      dispatchId,
      name: row.label,
      ...(modelRequest !== undefined ? { modelRequest } : {}),
      iteration: row.iteration,
      state: row.state === "pending" ? "running" : row.state,
      usage: yield* decodeUsage(row.usage_json),
    };
  });
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
): Effect.Effect<DispatchSession | undefined, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const raw = yield* Effect.sync(() =>
      db.db.prepare("SELECT * FROM runtime_work_nodes WHERE dispatch_id = ?").get(dispatchId),
    );
    if (raw === null) return undefined;
    const row = yield* decodeRow(raw);
    return yield* toDispatchSession(row);
  });

export const getWorkNode = (
  db: (typeof TheseusDb)["Service"],
  workNodeId: string,
): Effect.Effect<WorkNodeSession | undefined, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const raw = yield* Effect.sync(() =>
      db.db.prepare("SELECT * FROM runtime_work_nodes WHERE work_node_id = ?").get(workNodeId),
    );
    if (raw === null) return undefined;
    const row = yield* decodeRow(raw);
    return (yield* toDispatchSession(row)) ?? toWorkNodeSession(row);
  });

export const listWorkNodes = (
  db: (typeof TheseusDb)["Service"],
  options?: { readonly missionId?: string; readonly limit?: number },
): Effect.Effect<ReadonlyArray<WorkNodeSession>, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const limit = options?.limit ?? 100;
    const rows = yield* Effect.sync(() =>
      options?.missionId === undefined
        ? db.db
            .prepare("SELECT * FROM runtime_work_nodes ORDER BY started_at DESC LIMIT ?")
            .all(limit)
        : db.db
            .prepare(
              "SELECT * FROM runtime_work_nodes WHERE mission_id = ? ORDER BY started_at ASC LIMIT ?",
            )
            .all(options.missionId, limit),
    );
    const decoded = yield* Effect.forEach(rows, decodeRow);
    return decoded.map(toWorkNodeSession);
  });

export const listDispatchSessions = (
  db: (typeof TheseusDb)["Service"],
  options?: { readonly limit?: number },
): Effect.Effect<ReadonlyArray<DispatchSession>, RuntimeProjectionDecodeFailed> =>
  Effect.gen(function* () {
    const rows = yield* Effect.sync(() =>
      db.db
        .prepare(
          "SELECT * FROM runtime_work_nodes WHERE kind = 'dispatch' ORDER BY started_at DESC LIMIT ?",
        )
        .all(options?.limit ?? 100),
    );
    const decoded = yield* Effect.forEach(rows, decodeRow);
    const sessions = yield* Effect.forEach(decoded, toDispatchSession);
    return sessions.flatMap((session) => (session === undefined ? [] : [session]));
  });
