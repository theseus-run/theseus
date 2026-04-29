/**
 * SqliteDispatchStore — persistent DispatchStore backed by SQLite.
 *
 * Requires TheseusDb in the Layer.
 */

import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Rpc from "@theseus.run/core/Rpc";
import { Clock, Effect, Layer, Schema } from "effect";
import * as Prompt from "effect/unstable/ai/Prompt";
import { encodeJson } from "../json.ts";
import { TheseusDb } from "./sqlite.ts";

const nullable = <S extends Schema.Top>(schema: S) => Schema.NullOr(schema);

const DispatchEventRowSchema = Schema.Struct({
  dispatch_id: Schema.String,
  timestamp: Schema.Number,
  event_json: Schema.String,
});

const DispatchSnapshotRowSchema = Schema.Struct({
  dispatch_id: Schema.String,
  iteration: Schema.Number,
  messages_json: Schema.String,
  usage_json: Schema.String,
});

const DispatchSummaryRowSchema = Schema.Struct({
  dispatch_id: Schema.String,
  parent_dispatch_id: nullable(Schema.String),
  model_request_json: nullable(Schema.String),
  name: Schema.String,
  task: Schema.String,
  started_at: nullable(Schema.Number),
  completed_at: nullable(Schema.Number),
  failed_at: nullable(Schema.Number),
  done_json: nullable(Schema.String),
});

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
const PromptMessageEncodedSchema = Schema.toEncoded(Prompt.Message);

type DispatchEventRow = Schema.Schema.Type<typeof DispatchEventRowSchema>;
type DispatchSummaryRow = Schema.Schema.Type<typeof DispatchSummaryRowSchema>;
type ModelRequestWire = Schema.Schema.Type<typeof ModelRequestSchema>;

const decodeError = (source: string, cause: unknown): Dispatch.DispatchStoreDecodeFailed =>
  new Dispatch.DispatchStoreDecodeFailed({
    source,
    reason: String(cause),
    cause,
  });

const decodeProjection = <S extends Schema.Top>(
  source: string,
  schema: S,
  value: unknown,
): Effect.Effect<Schema.Schema.Type<S>, Dispatch.DispatchStoreDecodeFailed> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => decodeError(source, cause)),
  ) as Effect.Effect<Schema.Schema.Type<S>, Dispatch.DispatchStoreDecodeFailed>;

const decodeJsonProjection = <S extends Schema.Top>(
  source: string,
  schema: S,
  json: string,
): Effect.Effect<Schema.Schema.Type<S>, Dispatch.DispatchStoreDecodeFailed> =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(json).pipe(
    Effect.flatMap((value) => decodeProjection(source, schema, value)),
    Effect.mapError((cause) => decodeError(source, cause)),
  ) as Effect.Effect<Schema.Schema.Type<S>, Dispatch.DispatchStoreDecodeFailed>;

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

const decodeDispatchEvent = (
  source: string,
  json: string,
): Effect.Effect<Dispatch.DispatchEvent, Dispatch.DispatchStoreDecodeFailed> =>
  decodeJsonProjection(source, Rpc.DispatchEventSchema, json).pipe(
    Effect.map((event) => event as Dispatch.DispatchEvent),
  );

const decodeMessages = (
  json: string,
): Effect.Effect<ReadonlyArray<Prompt.MessageEncoded>, Dispatch.DispatchStoreDecodeFailed> =>
  decodeJsonProjection(
    "dispatch_snapshots.messages_json",
    Schema.Array(PromptMessageEncodedSchema),
    json,
  );

const decodeUsage = (
  source: string,
  json: string,
): Effect.Effect<Dispatch.Usage, Dispatch.DispatchStoreDecodeFailed> =>
  decodeJsonProjection(source, Dispatch.UsageSchema, json);

const decodeModelRequest = (
  json: string | null,
): Effect.Effect<Dispatch.ModelRequest | undefined, Dispatch.DispatchStoreDecodeFailed> =>
  json === null
    ? Effect.as(Effect.void, undefined)
    : decodeJsonProjection("dispatch_records.model_request_json", ModelRequestSchema, json).pipe(
        Effect.map(normalizeModelRequest),
      );

export const SqliteDispatchStore: Layer.Layer<Dispatch.DispatchStore, never, TheseusDb> =
  Layer.effect(Dispatch.DispatchStore)(
    Effect.gen(function* () {
      const { db } = yield* TheseusDb;

      const upsertRecord = db.prepare(
        "INSERT INTO dispatch_records (dispatch_id, name, task, parent_dispatch_id, model_request_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(dispatch_id) DO UPDATE SET name = excluded.name, task = excluded.task, parent_dispatch_id = excluded.parent_dispatch_id, model_request_json = excluded.model_request_json",
      );

      const insertEvent = db.prepare(
        "INSERT INTO dispatch_events (dispatch_id, timestamp, event_tag, event_json) VALUES (?, ?, ?, ?)",
      );

      const insertSnapshot = db.prepare(
        "INSERT INTO dispatch_snapshots (dispatch_id, iteration, timestamp, messages_json, usage_json) VALUES (?, ?, ?, ?, ?)",
      );

      const selectEvents = db.prepare(
        "SELECT dispatch_id, timestamp, event_json FROM dispatch_events WHERE dispatch_id = ? ORDER BY id",
      );

      const selectAllEvents = db.prepare(
        "SELECT dispatch_id, timestamp, event_json FROM dispatch_events ORDER BY id",
      );

      const selectLatestSnapshot = db.prepare(
        "SELECT dispatch_id, iteration, messages_json, usage_json FROM dispatch_snapshots WHERE dispatch_id = ? ORDER BY id DESC LIMIT 1",
      );

      const selectParentLink = db.prepare(
        "SELECT event_json FROM dispatch_events WHERE dispatch_id = ? AND event_tag = 'Injected' LIMIT 1",
      );

      const selectDispatchList = db.prepare(`
        SELECT
          r.dispatch_id,
          r.parent_dispatch_id,
          r.model_request_json,
          r.name,
          r.task,
          MIN(e.timestamp) as started_at,
          MAX(CASE WHEN e.event_tag = 'Done' THEN e.timestamp END) as completed_at,
          MAX(CASE WHEN e.event_tag = 'Failed' THEN e.timestamp END) as failed_at,
          MAX(CASE WHEN e.event_tag = 'Done' THEN e.event_json END) as done_json
        FROM dispatch_records r
        LEFT JOIN dispatch_events e ON e.dispatch_id = r.dispatch_id
        GROUP BY r.dispatch_id, r.parent_dispatch_id, r.model_request_json, r.name, r.task
        ORDER BY COALESCE(MIN(e.timestamp), 0) DESC
        LIMIT ?
      `);

      return {
        create: (input: Dispatch.DispatchCreate) =>
          Effect.gen(function* () {
            const id =
              input.requestedId !== undefined
                ? (input.requestedId as Dispatch.DispatchId)
                : yield* Dispatch.makeDispatchId(input.name);
            const record: Dispatch.DispatchRecord = {
              id,
              name: input.name,
              task: input.task,
              ...(input.parentDispatchId !== undefined
                ? { parentDispatchId: input.parentDispatchId }
                : {}),
              ...(input.modelRequest !== undefined ? { modelRequest: input.modelRequest } : {}),
            };
            upsertRecord.run(
              id,
              input.name,
              input.task,
              input.parentDispatchId ?? null,
              input.modelRequest === undefined ? null : encodeJson(input.modelRequest),
            );
            return record;
          }),

        record: (dispatchId: string, event: Dispatch.DispatchEvent) =>
          Effect.gen(function* () {
            const timestamp = yield* Clock.currentTimeMillis;
            insertEvent.run(dispatchId, timestamp, event._tag, encodeJson(event));
          }),

        snapshot: (
          dispatchId: string,
          iteration: number,
          messages: ReadonlyArray<Prompt.MessageEncoded>,
          usage: Dispatch.Usage,
        ) =>
          Effect.gen(function* () {
            const timestamp = yield* Clock.currentTimeMillis;
            insertSnapshot.run(
              dispatchId,
              iteration,
              timestamp,
              encodeJson(messages),
              encodeJson(usage),
            );
          }),

        events: (dispatchId?: string) =>
          Effect.gen(function* () {
            const rows = yield* Effect.sync(() =>
              dispatchId ? selectEvents.all(dispatchId) : selectAllEvents.all(),
            );
            const decodedRows = yield* Effect.forEach(rows, (row) =>
              decodeProjection("dispatch_events row", DispatchEventRowSchema, row),
            );
            return yield* Effect.forEach(decodedRows, (row: DispatchEventRow) =>
              decodeDispatchEvent("dispatch_events.event_json", row.event_json).pipe(
                Effect.map((event) => ({
                  dispatchId: row.dispatch_id,
                  timestamp: row.timestamp,
                  event,
                })),
              ),
            );
          }),

        restore: (dispatchId: string) =>
          Effect.gen(function* () {
            const rawRow = yield* Effect.sync(() => selectLatestSnapshot.get(dispatchId));
            if (rawRow === null) return undefined;
            const row = yield* decodeProjection(
              "dispatch_snapshots latest row",
              DispatchSnapshotRowSchema,
              rawRow,
            );

            // Look for parent link
            const linkRow = yield* Effect.sync(() => selectParentLink.get(dispatchId));
            let parentDispatchId: string | undefined;
            if (linkRow !== null) {
              const row = yield* decodeProjection(
                "dispatch_events parent link row",
                Schema.Struct({ event_json: Schema.String }),
                linkRow,
              );
              const event = yield* decodeDispatchEvent(
                "dispatch_events parent link event_json",
                row.event_json,
              );
              if (event._tag === "Injected" && event.injection === "ParentLink" && event.detail) {
                parentDispatchId = event.detail;
              }
            }

            const opts: Dispatch.DispatchOptions = {
              dispatchId,
              messages: yield* decodeMessages(row.messages_json),
              iteration: row.iteration,
              usage: yield* decodeUsage("dispatch_snapshots.usage_json", row.usage_json),
            };
            return parentDispatchId !== undefined ? { ...opts, parentDispatchId } : opts;
          }),

        list: (options?: { limit?: number }) =>
          Effect.gen(function* () {
            const limit = options?.limit ?? 100;
            const rows = yield* Effect.sync(() => selectDispatchList.all(limit));
            const decodedRows = yield* Effect.forEach(rows, (row) =>
              decodeProjection("dispatch list row", DispatchSummaryRowSchema, row),
            );
            return yield* Effect.forEach(decodedRows, (row: DispatchSummaryRow) =>
              Effect.gen(function* () {
                const doneEvent =
                  row.done_json === null
                    ? undefined
                    : yield* decodeDispatchEvent("dispatch_events.done_json", row.done_json);
                const modelRequest = yield* decodeModelRequest(row.model_request_json);
                const usage = doneEvent?._tag === "Done" ? doneEvent.result.usage : undefined;
                const status: Dispatch.DispatchSummary["status"] = row.completed_at
                  ? "done"
                  : row.failed_at
                    ? "failed"
                    : "running";
                return {
                  dispatchId: row.dispatch_id,
                  ...(row.parent_dispatch_id !== null
                    ? { parentDispatchId: row.parent_dispatch_id }
                    : {}),
                  ...(modelRequest !== undefined ? { modelRequest } : {}),
                  name: row.name,
                  task: row.task,
                  startedAt: row.started_at ?? 0,
                  completedAt: row.completed_at ?? row.failed_at,
                  status,
                  usage: usage ?? { inputTokens: 0, outputTokens: 0 },
                };
              }),
            );
          }),
      };
    }),
  );
