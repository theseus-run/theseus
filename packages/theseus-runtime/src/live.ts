import * as Agent from "@theseus.run/core/Agent";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import { Effect } from "effect";
import { TheseusRuntime } from "./index.ts";
import { DispatchRegistry } from "./registry.ts";
import { WorkNodeControllers } from "./runtime/controllers/work-node.ts";
import { makeRuntimeHost } from "./runtime/host.ts";
import { TheseusDb } from "./store/sqlite.ts";
import { ToolCatalog } from "./tool-catalog.ts";

export const TheseusRuntimeLive = Effect.gen(function* () {
  const deps = {
    registry: yield* DispatchRegistry,
    toolCatalog: yield* ToolCatalog,
    cortex: yield* Dispatch.Cortex,
    languageModelGateway: yield* Dispatch.LanguageModelGateway,
    satelliteRing: yield* Satellite.SatelliteRing,
    dispatchStore: yield* Dispatch.DispatchStore,
    blueprintRegistry: yield* Agent.BlueprintRegistry,
    workNodeControllers: yield* WorkNodeControllers,
    db: yield* TheseusDb,
  };

  return TheseusRuntime.of(makeRuntimeHost(deps));
});
