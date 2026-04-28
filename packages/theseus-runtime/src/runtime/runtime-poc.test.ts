import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Agent from "@theseus.run/core/Agent";
import * as AgentComm from "@theseus.run/core/AgentComm";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Satellite from "@theseus.run/core/Satellite";
import * as Tool from "@theseus.run/core/Tool";
import { Effect, Fiber, Layer, Schema, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import {
  makeMockLanguageModel,
  textParts,
  toolCallParts,
} from "../../../theseus-core/src/test-utils/mock-language-model.ts";
import { TheseusRuntime } from "../index.ts";
import { TheseusRuntimeLive } from "../live.ts";
import { DispatchRegistry, DispatchRegistryLive } from "../registry.ts";
import { SqliteDispatchStore, TheseusDbLive } from "../store/index.ts";
import { makeToolCatalog, ToolCatalog } from "../tool-catalog.ts";
import { RuntimeCommands, RuntimeControls, RuntimeQueries } from "./client.ts";
import { WorkNodeControllers, WorkNodeControllersLive } from "./controllers/work-node.ts";
import type { RuntimeDispatchEvent } from "./types.ts";

const probe = Tool.defineTool({
  name: "probe",
  description: "Return a deterministic probe observation.",
  input: Schema.Struct({ topic: Schema.String }),
  output: Schema.String,
  failure: Schema.Never,
  policy: { interaction: "observe" },
  execute: ({ topic }) => Effect.succeed(`probe:${topic}`),
});

const coordinatorOrder = {
  objective: "Ask the scout to inspect runtime wiring.",
  successCriteria: ["scout reports complete"],
  context: [{ kind: "instruction" as const, text: "Use the probe tool before reporting." }],
};

const pocResponses = [
  toolCallParts([
    {
      id: "dispatch-scout",
      name: AgentComm.dispatchGruntTool.name,
      arguments: JSON.stringify({ target: "scout", order: coordinatorOrder }),
    },
  ]),
  toolCallParts([
    {
      id: "probe-1",
      name: probe.name,
      arguments: JSON.stringify({ topic: "runtime" }),
    },
  ]),
  toolCallParts([
    {
      id: "report-1",
      name: AgentComm.report.name,
      arguments: JSON.stringify({
        channel: "complete",
        summary: "Scout complete",
        content: "Probe observed runtime wiring.",
        evidence: [{ id: "ev-1", kind: "tool_result", text: "probe:runtime" }],
        satisfaction: [
          {
            criterion: "scout reports complete",
            status: "satisfied",
            evidenceRefs: ["ev-1"],
          },
        ],
      }),
    },
  ]),
  textParts("grunt final"),
  textParts("coordinator final"),
];

const runtimeLayer = (responses = pocResponses) => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "theseus-runtime-")), "theseus.db");
  const DbLive = TheseusDbLive(dbPath);
  const StoreLive = Layer.provide(SqliteDispatchStore, DbLive);
  const RegistryLive = Layer.effect(DispatchRegistry)(DispatchRegistryLive);
  const WorkNodeControlLive = Layer.provide(
    Layer.effect(WorkNodeControllers)(WorkNodeControllersLive),
    RegistryLive,
  );
  const CatalogLive = Layer.succeed(ToolCatalog)(
    makeToolCatalog([AgentComm.dispatchGruntTool, probe]),
  );
  const BlueprintsLive = Agent.BlueprintRegistryLive([
    {
      name: "scout",
      modelRequest: { provider: "openai", model: "gpt-5.3-codex-spark" },
      systemPrompt: "You are a scout. Use tools, then call theseus_report.",
      tools: [probe],
    },
  ]);
  const LanguageModelGatewayLive = Layer.provide(
    Layer.effect(Dispatch.LanguageModelGateway)(
      Effect.gen(function* () {
        const languageModel = yield* LanguageModel.LanguageModel;
        return Dispatch.LanguageModelGateway.of({
          resolve: () => Effect.succeed(languageModel),
        });
      }),
    ),
    makeMockLanguageModel(responses),
  );
  const Services = Layer.mergeAll(
    DbLive,
    StoreLive,
    RegistryLive,
    WorkNodeControlLive,
    CatalogLive,
    BlueprintsLive,
    Dispatch.NoopCortex,
    LanguageModelGatewayLive,
    Satellite.DefaultSatelliteRing,
  );
  return {
    dbPath,
    layer: Layer.provide(Layer.effect(TheseusRuntime)(TheseusRuntimeLive), Services),
  };
};

const collectRuntimeEvents = (
  stream: Stream.Stream<RuntimeDispatchEvent>,
): Effect.Effect<ReadonlyArray<RuntimeDispatchEvent>> =>
  stream.pipe(
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
  );

describe("TheseusRuntime POC", () => {
  test("runs mission -> coordinator -> grunt -> tool -> report", async () => {
    const { layer } = runtimeLayer();

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "runtime-poc",
          goal: "Prove runtime POC",
          criteria: ["coordinator dispatch completes", "scout reports complete"],
        });
        const started = yield* RuntimeCommands.startMissionDispatch(runtime, {
          missionId: mission.missionId,
          spec: {
            name: "coordinator",
            modelRequest: { provider: "openai", model: "gpt-5.5" },
            systemPrompt: "Coordinate the mission by dispatching scout.",
            tools: [{ name: AgentComm.dispatchGruntTool.name }],
          },
          task: "Coordinate the runtime POC.",
        });
        const eventsFiber = yield* collectRuntimeEvents(started.events).pipe(Effect.forkChild);
        const result = yield* RuntimeQueries.getResult(runtime, started.session.dispatchId);
        const events = yield* Fiber.join(eventsFiber);
        const dispatches = yield* RuntimeQueries.listRuntimeDispatches(runtime);
        const workTree = yield* RuntimeQueries.getMissionWorkTree(runtime, mission.missionId);
        const missions = yield* RuntimeQueries.listMissions(runtime);
        const capsuleEvents = yield* RuntimeQueries.getCapsuleEvents(runtime, mission.capsuleId);
        const dispatchCapsuleEvents = yield* RuntimeQueries.getDispatchCapsuleEvents(
          runtime,
          started.session.dispatchId,
        );
        return {
          mission,
          session: started.session,
          result,
          events,
          dispatches,
          workTree,
          missions,
          capsuleEvents,
          dispatchCapsuleEvents,
        };
      }).pipe(Effect.provide(layer)),
    );

    expect(observed.result.content).toBe("coordinator final");
    expect(observed.session.missionId).toBe(observed.mission.missionId);
    expect(observed.session.capsuleId).toBe(observed.mission.capsuleId);
    expect(observed.events[0]?._tag).toBe("WorkNodeStarted");
    expect(observed.events[1]?._tag).toBe("DispatchSessionStarted");
    expect(observed.events.some((event) => event._tag === "DispatchEvent")).toBe(true);
    expect(observed.dispatches[0]?.missionId).toBe(observed.mission.missionId);
    expect(observed.dispatches[0]?.capsuleId).toBe(observed.mission.capsuleId);
    expect(observed.session.control.interrupt._tag).toBe("Supported");
    expect(observed.session.control.pause._tag).toBe("Unsupported");
    expect(observed.dispatches.map((session) => session.parentWorkNodeId)).toContain(
      observed.session.workNodeId,
    );
    expect(observed.workTree.map((node) => node.workNodeId)).toContain(observed.session.workNodeId);
    expect(observed.workTree.map((node) => node.relation)).toContain("delegated");
    expect(observed.dispatches.map((session) => session.modelRequest?.model)).toContain("gpt-5.5");
    expect(observed.dispatches.map((session) => session.modelRequest?.model)).toContain(
      "gpt-5.3-codex-spark",
    );
    expect(observed.missions[0]?.missionId).toBe(observed.mission.missionId);
    expect(observed.capsuleEvents.map((event) => event.type)).toContain("mission.create");
    expect(observed.capsuleEvents.map((event) => event.type)).toContain("dispatch.start");
    expect(observed.dispatchCapsuleEvents.map((event) => event.type)).toContain("mission.create");
    expect(
      observed.capsuleEvents.filter((event) => event.type === "mission.transition"),
    ).toHaveLength(2);
  });

  test("falls back to persisted terminal dispatch result without an active handle", async () => {
    const first = runtimeLayer([textParts("persisted final")]);

    const completed = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "persisted-result",
          goal: "Persist result",
          criteria: ["done"],
        });
        const started = yield* RuntimeCommands.startMissionDispatch(runtime, {
          missionId: mission.missionId,
          spec: {
            name: "coordinator",
            systemPrompt: "Return final text.",
            tools: [],
          },
          task: "finish",
        });
        const eventsFiber = yield* collectRuntimeEvents(started.events).pipe(Effect.forkChild);
        const result = yield* RuntimeQueries.getResult(runtime, started.session.dispatchId);
        yield* Fiber.join(eventsFiber);
        return { dispatchId: started.session.dispatchId, content: result.content };
      }).pipe(Effect.provide(first.layer)),
    );

    const DbLive = TheseusDbLive(first.dbPath);
    const StoreLive = Layer.provide(SqliteDispatchStore, DbLive);
    const RegistryLive = Layer.effect(DispatchRegistry)(DispatchRegistryLive);
    const WorkNodeControlLive = Layer.provide(
      Layer.effect(WorkNodeControllers)(WorkNodeControllersLive),
      RegistryLive,
    );
    const CatalogLive = Layer.succeed(ToolCatalog)(makeToolCatalog([]));
    const Services = Layer.mergeAll(
      DbLive,
      StoreLive,
      RegistryLive,
      WorkNodeControlLive,
      CatalogLive,
      Agent.BlueprintRegistryLive([]),
      Dispatch.NoopCortex,
      Layer.provide(Dispatch.LanguageModelGatewayFromLanguageModel, makeMockLanguageModel([])),
      Satellite.DefaultSatelliteRing,
    );
    const secondLayer = Layer.provide(Layer.effect(TheseusRuntime)(TheseusRuntimeLive), Services);

    const restored = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeQueries.getResult(runtime, completed.dispatchId);
      }).pipe(Effect.provide(secondLayer)),
    );

    expect(restored.content).toBe(completed.content);
  });

  test("controls active dispatches through work node identity", async () => {
    const { layer } = runtimeLayer([textParts("controlled final")]);

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "work-node-control",
          goal: "Control active work",
          criteria: ["guidance accepted"],
        });
        const started = yield* RuntimeCommands.startMissionDispatch(runtime, {
          missionId: mission.missionId,
          spec: {
            name: "coordinator",
            systemPrompt: "Return final text.",
            tools: [],
          },
          task: "finish",
        });
        yield* RuntimeControls.controlWorkNode(runtime, started.session.workNodeId, {
          _tag: "RequestStatus",
        });
        const result = yield* RuntimeQueries.getResult(runtime, started.session.dispatchId);
        return { session: started.session, result };
      }).pipe(Effect.provide(layer)),
    );

    expect(observed.session.control.requestStatus._tag).toBe("Supported");
    expect(observed.result.content).toBe("controlled final");
  });

  test("rejects unsupported dispatch work-node controls", async () => {
    const { layer } = runtimeLayer([textParts("pause test final")]);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "work-node-pause",
          goal: "Reject unsupported pause",
          criteria: ["pause rejected"],
        });
        const started = yield* RuntimeCommands.startMissionDispatch(runtime, {
          missionId: mission.missionId,
          spec: {
            name: "coordinator",
            systemPrompt: "Return final text.",
            tools: [],
          },
          task: "finish",
        });
        return yield* RuntimeControls.controlWorkNode(runtime, started.session.workNodeId, {
          _tag: "Pause",
          reason: "operator requested pause",
        }).pipe(Effect.flip);
      }).pipe(Effect.provide(layer)),
    );

    expect(error._tag).toBe("RuntimeWorkControlUnsupported");
  });

  test("root runtime import does not export live assembly", async () => {
    const root = await import("../index.ts");
    expect("TheseusRuntimeLive" in root).toBe(false);
  });
});
