/**
 * TheseusRuntime — live work boundary for the process.
 *
 * Transport adapters submit commands, controls, and queries. The runtime owns
 * live work orchestration; submodules own dispatch running, active registry
 * updates, persistence-backed reads, and convenience client helpers.
 */

import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import { Context, Effect, Match } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import { DispatchRegistry } from "./registry.ts";
import { RuntimeCommands, RuntimeControls, RuntimeQueries } from "./runtime/client.ts";
import { startDispatch } from "./runtime/dispatch-runner.ts";
import { runRuntimeControl, runRuntimeQuery, snapshot } from "./runtime/operations.ts";
import type {
  RuntimeCommand,
  RuntimeControl,
  RuntimeError,
  RuntimeQuery,
  RuntimeQueryResult,
  RuntimeSnapshot,
  RuntimeSubmission,
  TheseusRuntimeService,
} from "./runtime/types.ts";
import { RuntimeDispatchFailed, RuntimeNotFound, RuntimeToolNotFound } from "./runtime/types.ts";
import { TheseusDb } from "./store/sqlite.ts";
import { ToolCatalog } from "./tool-catalog.ts";

export type {
  RuntimeCommand,
  RuntimeControl,
  RuntimeError,
  RuntimeQuery,
  RuntimeQueryResult,
  RuntimeSnapshot,
  RuntimeSubmission,
  StartDispatchInput,
  StatusEntry,
  TheseusRuntimeService,
} from "./runtime/types.ts";
export {
  RuntimeCommands,
  RuntimeControls,
  RuntimeDispatchFailed,
  RuntimeNotFound,
  RuntimeQueries,
  RuntimeToolNotFound,
};

export class TheseusRuntime extends Context.Service<TheseusRuntime, TheseusRuntimeService>()(
  "TheseusRuntime",
) {}

export const TheseusRuntimeLive = Effect.gen(function* () {
  const deps = {
    registry: yield* DispatchRegistry,
    toolCatalog: yield* ToolCatalog,
    languageModel: yield* LanguageModel.LanguageModel,
    satelliteRing: yield* Satellite.SatelliteRing,
    dispatchStore: yield* Dispatch.DispatchStore,
    db: yield* TheseusDb,
  };

  const submit = (command: RuntimeCommand): Effect.Effect<RuntimeSubmission, RuntimeError> =>
    Match.value(command).pipe(
      Match.tag("DispatchStart", ({ input }) =>
        startDispatch(deps, input).pipe(
          Effect.map((events): RuntimeSubmission => ({ _tag: "DispatchStarted", events })),
        ),
      ),
      Match.exhaustive,
    );

  const control = (command: RuntimeControl): Effect.Effect<void, RuntimeError> =>
    runRuntimeControl(deps, command);

  const query = (runtimeQuery: RuntimeQuery): Effect.Effect<RuntimeQueryResult, RuntimeError> =>
    runRuntimeQuery(deps, runtimeQuery);

  const getSnapshot = (): Effect.Effect<RuntimeSnapshot> => snapshot(deps.registry);

  return TheseusRuntime.of({ submit, control, query, getSnapshot });
});
