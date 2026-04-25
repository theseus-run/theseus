/**
 * RPC Handlers — server-side implementations for each Theseus RPC procedure.
 *
 * Each handler is an Effect that accesses services (DispatchLog, ToolRegistry,
 * DispatchRegistry) and returns typed results matching the RPC schemas.
 */

import * as Agent from "@theseus.run/core/Agent";
import * as CapsuleNs from "@theseus.run/core/Capsule";
import * as Dispatch from "@theseus.run/core/Dispatch";
import { RpcError, TheseusRpc } from "@theseus.run/core/Rpc";
import * as Satellite from "@theseus.run/core/Satellite";
import { Effect, Layer, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import { DispatchRegistry } from "./registry.ts";
import { serializeEvent } from "./serialize.ts";
import { TheseusDb } from "./store/sqlite.ts";
import { SqliteCapsuleLive } from "./store/sqlite-capsule.ts";
import { resolveBlueprint, ToolRegistry } from "./tool-registry.ts";

// ---------------------------------------------------------------------------
// Tags to skip over the wire (verbose model internals)
// ---------------------------------------------------------------------------

const SKIP_TAGS = new Set(["Thinking"]);

// ---------------------------------------------------------------------------
// Handlers Layer
// ---------------------------------------------------------------------------

export const HandlersLive = TheseusRpc.toLayer({
  dispatch: ({ spec: bp, task, continueFrom }) =>
    Effect.gen(function* () {
      const log = yield* Dispatch.DispatchLog;
      const registry = yield* DispatchRegistry;
      const toolRegistry = yield* ToolRegistry;
      const lm = yield* LanguageModel.LanguageModel;
      const ring = yield* Satellite.SatelliteRing;
      const store = yield* Dispatch.DispatchStore;
      const theseusDb = yield* TheseusDb;

      const blueprint = resolveBlueprint(bp, toolRegistry);
      const resolved = toolRegistry.resolve(bp.tools.map((t) => t.name));
      const missing = bp.tools
        .filter((t) => !resolved.some((rt) => rt.name === t.name))
        .map((t) => t.name);

      if (missing.length > 0) {
        return yield* new RpcError({
          code: "TOOL_NOT_FOUND",
          message: `Unknown tools: ${missing.join(", ")}`,
        });
      }

      // Resolve dispatch options — restore from previous dispatch if continuing
      let options: Dispatch.DispatchOptions | undefined;
      if (continueFrom) {
        const restored = yield* log.restore(continueFrom);
        if (restored?.messages) {
          options = {
            ...restored,
            messages: [...restored.messages, { role: "user" as const, content: task }],
          };
        }
      }

      // Create per-dispatch Capsule backed by SQLite
      const dbLayer = Layer.succeed(TheseusDb)(theseusDb);
      const capsuleLayer = Layer.provide(SqliteCapsuleLive(blueprint.name), dbLayer);
      const getCapsule = Effect.gen(function* () {
        return yield* CapsuleNs.Capsule;
      });
      const capsule = yield* Effect.provide(getCapsule, capsuleLayer);

      yield* capsule.log({
        type: "dispatch.start",
        by: "runtime",
        data: { task, name: blueprint.name, continueFrom },
      });

      // Provide ambient services for dispatch
      const depsLayer = Layer.mergeAll(
        Layer.succeed(LanguageModel.LanguageModel)(lm),
        Layer.succeed(Satellite.SatelliteRing)(ring),
        Layer.succeed(Dispatch.DispatchLog)(log),
        Layer.succeed(Dispatch.DispatchStore)(store),
        capsuleLayer,
        Agent.AgentIdentityLive(blueprint.name),
      );

      const handle = yield* Effect.provide(Dispatch.dispatch(blueprint, task, options), depsLayer);
      yield* registry.register(handle, blueprint.name);

      // Return the event stream — RPC framework handles serialization + backpressure
      return handle.events.pipe(
        Stream.filter((e) => !SKIP_TAGS.has(e._tag)),
        Stream.tap((e) =>
          e._tag === "Calling"
            ? registry.updateStatus(handle.dispatchId, { iteration: e.iteration })
            : e._tag === "Done"
              ? Effect.gen(function* () {
                  // Save final snapshot for session continuity
                  const finalMessages = yield* handle.messages;
                  yield* log.snapshot(
                    handle.dispatchId,
                    -1,
                    [...finalMessages, { role: "assistant" as const, content: e.result.content }],
                    e.result.usage,
                  );
                  yield* capsule.log({
                    type: "dispatch.done",
                    by: "runtime",
                    data: {
                      dispatchId: handle.dispatchId,
                      content: e.result.content,
                    },
                  });
                  yield* registry.updateStatus(handle.dispatchId, { state: "done" });
                })
              : Effect.void,
        ),
        Stream.map((e) => serializeEvent(e)),
      ) as unknown as never;
    }),

  listDispatches: ({ limit }) =>
    Effect.gen(function* () {
      const log = yield* Dispatch.DispatchLog;
      return yield* log.list(limit !== undefined ? { limit } : undefined);
    }),

  getMessages: ({ dispatchId }) =>
    Effect.gen(function* () {
      const log = yield* Dispatch.DispatchLog;
      const restored = yield* log.restore(dispatchId);
      return (restored?.messages ?? []).map((m) => ({
        role: String(m.role ?? ""),
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));
    }),

  inject: ({ dispatchId, text }) =>
    Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      const handle = yield* registry.get(dispatchId);
      if (handle === null) {
        return yield* new RpcError({
          code: "NOT_FOUND",
          message: `Dispatch ${dispatchId} not found`,
        });
      }
      yield* handle.inject({
        _tag: "AppendMessages",
        messages: [{ role: "user", content: text }],
      });
    }),

  interrupt: ({ dispatchId }) =>
    Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      const handle = yield* registry.get(dispatchId);
      if (handle === null) {
        return yield* new RpcError({
          code: "NOT_FOUND",
          message: `Dispatch ${dispatchId} not found`,
        });
      }
      yield* handle.interrupt;
    }),

  getResult: ({ dispatchId }) =>
    Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      const handle = yield* registry.get(dispatchId);
      if (handle === null) {
        return yield* new RpcError({
          code: "NOT_FOUND",
          message: `Dispatch ${dispatchId} not found`,
        });
      }
      const result = yield* Effect.catch(handle.result, (dispatchErr) =>
        Effect.fail(
          new RpcError({
            code: "INTERNAL",
            message: `Dispatch error: ${
              typeof dispatchErr === "object" && dispatchErr !== null && "_tag" in dispatchErr
                ? String(dispatchErr._tag)
                : "unknown"
            }`,
          }),
        ),
      );
      return result;
    }),

  getCapsuleEvents: ({ capsuleId }) =>
    Effect.gen(function* () {
      const { db } = yield* TheseusDb;
      const rows = db
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
    }),

  status: () =>
    Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      return yield* registry.list();
    }),
});
