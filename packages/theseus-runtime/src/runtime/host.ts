import type { SqliteClient } from "@effect/sql-sqlite-bun";
import type * as Agent from "@theseus.run/core/Agent";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type * as Satellite from "@theseus.run/core/Satellite";
import { Effect, Match } from "effect";
import type { DispatchRegistry } from "../registry.ts";
import type { TheseusDb } from "../store/sqlite.ts";
import type { ToolCatalog } from "../tool-catalog.ts";
import type { WorkNodeControllers } from "./controllers/work-node.ts";
import type { RuntimeEventBus } from "./event-bus.ts";
import { runRuntimeControl, runRuntimeQuery } from "./operations.ts";
import { startDispatch } from "./systems/dispatch/system.ts";
import { createMission } from "./systems/mission/system.ts";
import type {
  RuntimeCommand,
  RuntimeControl,
  RuntimeError,
  RuntimeQuery,
  RuntimeQueryResult,
  RuntimeSubmission,
  TheseusRuntimeService,
} from "./types.ts";
import { RuntimeProjectionDecodeFailed } from "./types.ts";
import type { WorkSupervisor } from "./work-supervisor.ts";

export interface RuntimeHostDeps {
  readonly registry: (typeof DispatchRegistry)["Service"];
  readonly toolCatalog: (typeof ToolCatalog)["Service"];
  readonly cortex: (typeof Dispatch.Cortex)["Service"];
  readonly languageModelGateway: (typeof Dispatch.LanguageModelGateway)["Service"];
  readonly satelliteRing: (typeof Satellite.SatelliteRing)["Service"];
  readonly dispatchStore: (typeof Dispatch.DispatchStore)["Service"];
  readonly blueprintRegistry: (typeof Agent.BlueprintRegistry)["Service"];
  readonly workNodeControllers: (typeof WorkNodeControllers)["Service"];
  readonly eventBus: (typeof RuntimeEventBus)["Service"];
  readonly workSupervisor: (typeof WorkSupervisor)["Service"];
  readonly db: (typeof TheseusDb)["Service"];
  readonly sql: (typeof SqliteClient.SqliteClient)["Service"];
}

export const makeRuntimeHost = (deps: RuntimeHostDeps): TheseusRuntimeService => {
  const submit = (command: RuntimeCommand): Effect.Effect<RuntimeSubmission, RuntimeError> =>
    Match.value(command).pipe(
      Match.tag("MissionCreate", ({ input }) =>
        createMission(deps.db, deps.sql, input).pipe(
          Effect.mapError(
            (cause) =>
              new RuntimeProjectionDecodeFailed({
                source: "runtime_mission_capsules write",
                reason: String(cause),
                cause,
              }),
          ),
          Effect.map((mission): RuntimeSubmission => ({ _tag: "MissionCreated", mission })),
        ),
      ),
      Match.tag("MissionStartDispatch", ({ input }) =>
        startDispatch(deps, input).pipe(
          Effect.map(
            ({ session, events }): RuntimeSubmission => ({
              _tag: "DispatchStarted",
              session,
              events,
            }),
          ),
        ),
      ),
      Match.exhaustive,
      Effect.withSpan("runtime.command", { attributes: { "runtime.command": command._tag } }),
    );

  const control = (command: RuntimeControl): Effect.Effect<void, RuntimeError> =>
    runRuntimeControl(deps, command).pipe(
      Effect.withSpan("runtime.control", {
        attributes: {
          "runtime.control": command._tag,
          "work_node.id": command.workNodeId,
          "work_control.command": command.command._tag,
        },
      }),
    );

  const query = (runtimeQuery: RuntimeQuery): Effect.Effect<RuntimeQueryResult, RuntimeError> =>
    runRuntimeQuery(deps, runtimeQuery).pipe(
      Effect.withSpan("runtime.query", {
        attributes: { "runtime.query": runtimeQuery._tag },
      }),
    );

  return { submit, control, query };
};
