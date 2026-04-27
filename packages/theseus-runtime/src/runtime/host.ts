import type * as Agent from "@theseus.run/core/Agent";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type * as Satellite from "@theseus.run/core/Satellite";
import { Effect, Match } from "effect";
import type { DispatchRegistry } from "../registry.ts";
import type { TheseusDb } from "../store/sqlite.ts";
import type { ToolCatalog } from "../tool-catalog.ts";
import { runRuntimeControl, runRuntimeQuery, snapshot } from "./operations.ts";
import { startDispatch } from "./systems/dispatch/system.ts";
import { createMission } from "./systems/mission/system.ts";
import type {
  RuntimeCommand,
  RuntimeControl,
  RuntimeError,
  RuntimeQuery,
  RuntimeQueryResult,
  RuntimeSnapshot,
  RuntimeSubmission,
  TheseusRuntimeService,
} from "./types.ts";

export interface RuntimeHostDeps {
  readonly registry: (typeof DispatchRegistry)["Service"];
  readonly toolCatalog: (typeof ToolCatalog)["Service"];
  readonly languageModelGateway: (typeof Dispatch.LanguageModelGateway)["Service"];
  readonly satelliteRing: (typeof Satellite.SatelliteRing)["Service"];
  readonly dispatchStore: (typeof Dispatch.DispatchStore)["Service"];
  readonly blueprintRegistry: (typeof Agent.BlueprintRegistry)["Service"];
  readonly db: (typeof TheseusDb)["Service"];
}

export const makeRuntimeHost = (deps: RuntimeHostDeps): TheseusRuntimeService => {
  const submit = (command: RuntimeCommand): Effect.Effect<RuntimeSubmission, RuntimeError> =>
    Match.value(command).pipe(
      Match.tag("MissionCreate", ({ input }) =>
        createMission(deps.db, input).pipe(
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
    );

  const control = (command: RuntimeControl): Effect.Effect<void, RuntimeError> =>
    runRuntimeControl(deps, command);

  const query = (runtimeQuery: RuntimeQuery): Effect.Effect<RuntimeQueryResult, RuntimeError> =>
    runRuntimeQuery(deps, runtimeQuery);

  const getSnapshot = (): Effect.Effect<RuntimeSnapshot> => snapshot(deps);

  return { submit, control, query, getSnapshot };
};
