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
import {
  SqliteDispatchStore,
  TheseusDb,
  TheseusDbLive,
  TheseusSqliteLive,
} from "../store/index.ts";
import { makeToolCatalog, ToolCatalog } from "../tool-catalog.ts";
import { RuntimeCommands, RuntimeControls, RuntimeQueries } from "./client.ts";
import { WorkNodeControllers, WorkNodeControllersLive } from "./controllers/work-node.ts";
import { RuntimeEventBus, RuntimeEventBusLive } from "./event-bus.ts";
import {
  type DispatchSession,
  type RuntimeDispatchEvent,
  RuntimeProjectionDecodeFailed,
  WorkNodeId,
} from "./types.ts";
import { WorkControlDescriptors } from "./work-control.ts";
import { WorkSupervisor, WorkSupervisorLive } from "./work-supervisor.ts";

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

const failingSnapshotStore = Layer.succeed(Dispatch.DispatchStore)(
  Dispatch.DispatchStore.of({
    create: (input) =>
      Effect.gen(function* () {
        const id =
          input.requestedId !== undefined
            ? (input.requestedId as Dispatch.DispatchId)
            : yield* Dispatch.makeDispatchId(input.name);
        return {
          id,
          name: input.name,
          task: input.task,
          ...(input.parentDispatchId !== undefined
            ? { parentDispatchId: input.parentDispatchId }
            : {}),
          ...(input.modelRequest !== undefined ? { modelRequest: input.modelRequest } : {}),
        };
      }),
    record: () => Effect.void,
    snapshot: (_dispatchId, iteration) =>
      iteration === -1 ? Effect.die("snapshot failed") : Effect.void,
    events: () => Effect.succeed([]),
    restore: () => Effect.as(Effect.void, undefined),
    list: () => Effect.succeed([]),
  }),
);

const runtimeLayer = (
  responses = pocResponses,
  storeLive?: Layer.Layer<Dispatch.DispatchStore>,
) => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "theseus-runtime-")), "theseus.db");
  const DbLive = TheseusDbLive(dbPath);
  const SqlLive = TheseusSqliteLive(dbPath);
  const StoreLive = storeLive ?? Layer.provide(SqliteDispatchStore, DbLive);
  const RegistryLive = Layer.effect(DispatchRegistry)(DispatchRegistryLive);
  const EventBusLive = RuntimeEventBusLive;
  const SupervisorLive = Layer.provide(
    Layer.effect(WorkSupervisor)(WorkSupervisorLive),
    EventBusLive,
  );
  const WorkNodeControlLive = Layer.provide(
    Layer.effect(WorkNodeControllers)(WorkNodeControllersLive),
    SupervisorLive,
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
    EventBusLive,
    SupervisorLive,
    WorkNodeControlLive,
    CatalogLive,
    BlueprintsLive,
    Dispatch.NoopCortex,
    LanguageModelGatewayLive,
    Satellite.DefaultSatelliteRing,
    SqlLive,
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
    expect(observed.session.control.pause._tag).toBe("Supported");
    expect(
      observed.events.some(
        (event) =>
          event._tag === "DispatchSessionStarted" &&
          event.session.parentWorkNodeId === observed.session.workNodeId,
      ),
    ).toBe(true);
    expect(
      observed.events.some(
        (event) =>
          event._tag === "WorkNodeStateChanged" &&
          event.workNodeId === observed.session.workNodeId &&
          event.state === "done",
      ),
    ).toBe(true);
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

    const rootDoneIndex = observed.events.findIndex(
      (event) =>
        event._tag === "DispatchEvent" &&
        event.workNodeId === observed.session.workNodeId &&
        event.event._tag === "Done",
    );
    const rootTerminalIndex = observed.events.findIndex(
      (event) =>
        event._tag === "WorkNodeStateChanged" &&
        event.workNodeId === observed.session.workNodeId &&
        event.state === "done",
    );
    expect(rootDoneIndex).toBeGreaterThanOrEqual(0);
    expect(rootTerminalIndex).toBeGreaterThan(rootDoneIndex);

    const coordinatorNode = observed.workTree.find(
      (node) => node.workNodeId === observed.session.workNodeId,
    ) as DispatchSession | undefined;
    expect(coordinatorNode?.kind).toBe("dispatch");
    expect(coordinatorNode?.dispatchId).toBe(observed.session.dispatchId);
    expect(coordinatorNode?.modelRequest?.model).toBe("gpt-5.5");
    expect(coordinatorNode?.iteration).toBeGreaterThanOrEqual(0);
    expect(coordinatorNode?.usage.inputTokens).toBeGreaterThanOrEqual(0);
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
    const SqlLive = TheseusSqliteLive(first.dbPath);
    const StoreLive = Layer.provide(SqliteDispatchStore, DbLive);
    const RegistryLive = Layer.effect(DispatchRegistry)(DispatchRegistryLive);
    const EventBusLive = RuntimeEventBusLive;
    const SupervisorLive = Layer.provide(
      Layer.effect(WorkSupervisor)(WorkSupervisorLive),
      EventBusLive,
    );
    const WorkNodeControlLive = Layer.provide(
      Layer.effect(WorkNodeControllers)(WorkNodeControllersLive),
      SupervisorLive,
    );
    const CatalogLive = Layer.succeed(ToolCatalog)(makeToolCatalog([]));
    const Services = Layer.mergeAll(
      DbLive,
      StoreLive,
      RegistryLive,
      EventBusLive,
      SupervisorLive,
      WorkNodeControlLive,
      CatalogLive,
      Agent.BlueprintRegistryLive([]),
      Dispatch.NoopCortex,
      Layer.provide(Dispatch.LanguageModelGatewayFromLanguageModel, makeMockLanguageModel([])),
      Satellite.DefaultSatelliteRing,
      SqlLive,
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

  test("pauses and resumes active dispatches through work node identity", async () => {
    const { layer } = runtimeLayer([textParts("pause test final")]);

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "work-node-pause",
          goal: "Pause active work",
          criteria: ["pause accepted"],
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
          _tag: "Pause",
          reason: "operator requested pause",
        });
        const paused = yield* RuntimeQueries.getMissionWorkTree(runtime, mission.missionId);
        yield* RuntimeControls.controlWorkNode(runtime, started.session.workNodeId, {
          _tag: "Resume",
        });
        const result = yield* RuntimeQueries.getResult(runtime, started.session.dispatchId);
        return { paused, result };
      }).pipe(Effect.provide(layer)),
    );

    expect(observed.paused[0]?.state).toBe("paused");
    expect(observed.result.content).toBe("pause test final");
  });

  test("interrupt persists active work as aborted", async () => {
    const { layer } = runtimeLayer([textParts("interrupted final")]);

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "work-node-interrupt",
          goal: "Interrupt active work",
          criteria: ["interrupt persisted"],
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
          _tag: "Pause",
        });
        yield* RuntimeControls.controlWorkNode(runtime, started.session.workNodeId, {
          _tag: "Interrupt",
          reason: "operator interrupt",
        });
        return yield* RuntimeQueries.getMissionWorkTree(runtime, mission.missionId);
      }).pipe(Effect.provide(layer)),
    );

    expect(observed[0]?.state).toBe("aborted");
  });

  test("stop does not rewrite completed work state", async () => {
    const { layer } = runtimeLayer([textParts("completed before stop")]);

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "work-node-stop-completed",
          goal: "Stop completed work",
          criteria: ["done remains done"],
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
        yield* RuntimeQueries.getResult(runtime, started.session.dispatchId);
        yield* Fiber.join(eventsFiber);
        yield* RuntimeControls.controlWorkNode(runtime, started.session.workNodeId, {
          _tag: "Stop",
          reason: "late stop",
        }).pipe(Effect.catchTag("RuntimeWorkControlUnsupported", () => Effect.void));
        return yield* RuntimeQueries.getMissionWorkTree(runtime, mission.missionId);
      }).pipe(Effect.provide(layer)),
    );

    expect(observed[0]?.state).toBe("done");
  });

  test("supervised process failures are published and reconcile active work state", async () => {
    const EventBusLive = RuntimeEventBusLive;
    const SupervisorLive = Layer.provide(
      Layer.effect(WorkSupervisor)(WorkSupervisorLive),
      EventBusLive,
    );
    const layer = Layer.mergeAll(EventBusLive, SupervisorLive);

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const supervisor = yield* WorkSupervisor;
        const bus = yield* RuntimeEventBus;
        const workNodeId = WorkNodeId.make("work-process-failure");
        const handle: Dispatch.DispatchHandle = {
          dispatchId: "dispatch-process-failure",
          events: Stream.empty,
          inject: () => Effect.void,
          pause: Effect.void,
          resume: Effect.void,
          stop: () => Effect.void,
          controlState: Effect.succeed({ _tag: "Running" }),
          interrupt: Effect.void,
          result: Effect.never,
          messages: Effect.succeed([]),
        };
        yield* supervisor.registerDispatch(
          {
            workNodeId,
            missionId: "mission-process-failure",
            capsuleId: "capsule-process-failure",
            kind: "dispatch",
            relation: "root",
            label: "process-failure",
            state: "running",
            control: WorkControlDescriptors.dispatch("running"),
          },
          handle,
        );
        yield* supervisor.forkProcess(workNodeId, "failing-process", Effect.die("boom"));
        return yield* bus
          .streamMission("mission-process-failure")
          .pipe(Stream.take(2), Stream.runCollect);
      }).pipe(Effect.provide(layer)),
    );

    const events = Array.from(observed);
    expect(events.map((event) => event._tag)).toEqual([
      "RuntimeProcessFailed",
      "WorkNodeStateChanged",
    ]);
    expect(events[1]?._tag === "WorkNodeStateChanged" && events[1].state).toBe("failed");
  });

  test("dispatch completion process failure reconciles persisted dispatch work state", async () => {
    const { layer } = runtimeLayer(
      [textParts("completion side effect fails")],
      failingSnapshotStore,
    );

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "dispatch-completion-failure",
          goal: "Reconcile completion failure",
          criteria: ["work becomes failed"],
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
        const events = yield* Fiber.join(eventsFiber);
        const workTree = yield* RuntimeQueries.getMissionWorkTree(runtime, mission.missionId);
        return { events, result, session: started.session, workTree };
      }).pipe(Effect.provide(layer)),
    );

    expect(observed.result.content).toBe("completion side effect fails");
    expect(observed.events.some((event) => event._tag === "RuntimeProcessFailed")).toBe(true);
    expect(
      observed.events.some(
        (event) =>
          event._tag === "WorkNodeStateChanged" &&
          event.workNodeId === observed.session.workNodeId &&
          event.state === "failed",
      ),
    ).toBe(true);
    expect(observed.workTree[0]?.state).toBe("failed");
  });

  test("capsule event query reports corrupt persisted JSON as a typed decode failure", async () => {
    const { layer, dbPath } = runtimeLayer([]);

    const mission = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeCommands.createMission(runtime, {
          slug: "corrupt-capsule-json",
          goal: "Corrupt capsule query",
          criteria: [],
        });
      }).pipe(Effect.provide(layer)),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* TheseusDb;
        yield* Effect.sync(() => {
          db.db
            .prepare(
              "INSERT INTO capsule_events (capsule_id, type, at, by, data_json) VALUES (?, ?, ?, ?, ?)",
            )
            .run(mission.capsuleId, "bad.event", "2026-04-29T00:00:00.000Z", "test", "{");
        });
      }).pipe(Effect.provide(TheseusDbLive(dbPath))),
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeQueries.getCapsuleEvents(runtime, mission.capsuleId).pipe(
          Effect.as(undefined),
          Effect.catchTag("RuntimeProjectionDecodeFailed", (error) => Effect.succeed(error)),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(failure).toBeInstanceOf(RuntimeProjectionDecodeFailed);
  });

  test("dispatch event query reports corrupt persisted JSON as a typed decode failure", async () => {
    const { layer, dbPath } = runtimeLayer([textParts("dispatch event corruption target")]);

    const dispatchId = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        const mission = yield* RuntimeCommands.createMission(runtime, {
          slug: "corrupt-dispatch-event-json",
          goal: "Corrupt dispatch event query",
          criteria: [],
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
        yield* RuntimeQueries.getResult(runtime, started.session.dispatchId);
        yield* Fiber.join(eventsFiber);
        return started.session.dispatchId;
      }).pipe(Effect.provide(layer)),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* TheseusDb;
        yield* Effect.sync(() => {
          db.db
            .prepare(
              "INSERT INTO dispatch_events (dispatch_id, timestamp, event_tag, event_json) VALUES (?, ?, ?, ?)",
            )
            .run(dispatchId, 1, "Done", "{");
        });
      }).pipe(Effect.provide(TheseusDbLive(dbPath))),
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeQueries.getDispatchEvents(runtime, dispatchId).pipe(
          Effect.as(undefined),
          Effect.catchTag("RuntimeProjectionDecodeFailed", (error) => Effect.succeed(error)),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(failure).toBeInstanceOf(RuntimeProjectionDecodeFailed);
  });

  test("continueFrom reports corrupt persisted snapshot JSON as a typed decode failure", async () => {
    const { layer, dbPath } = runtimeLayer([]);
    const dispatchId = "corrupt-snapshot-dispatch";

    const mission = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeCommands.createMission(runtime, {
          slug: "corrupt-snapshot-json",
          goal: "Corrupt snapshot restore",
          criteria: [],
        });
      }).pipe(Effect.provide(layer)),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* TheseusDb;
        yield* Effect.sync(() => {
          db.db
            .prepare(
              "INSERT INTO dispatch_snapshots (dispatch_id, iteration, timestamp, messages_json, usage_json) VALUES (?, ?, ?, ?, ?)",
            )
            .run(dispatchId, 0, 1, "[", JSON.stringify({ inputTokens: 1, outputTokens: 2 }));
        });
      }).pipe(Effect.provide(TheseusDbLive(dbPath))),
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeCommands.startMissionDispatch(runtime, {
          missionId: mission.missionId,
          continueFrom: dispatchId,
          spec: {
            name: "coordinator",
            systemPrompt: "Return final text.",
            tools: [],
          },
          task: "continue",
        }).pipe(
          Effect.as(undefined),
          Effect.catchTag("RuntimeProjectionDecodeFailed", (error) => Effect.succeed(error)),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(failure).toBeInstanceOf(RuntimeProjectionDecodeFailed);
  });

  test("continueFrom reports corrupt persisted usage JSON as a typed decode failure", async () => {
    const { layer, dbPath } = runtimeLayer([]);
    const dispatchId = "corrupt-usage-dispatch";

    const mission = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeCommands.createMission(runtime, {
          slug: "corrupt-usage-json",
          goal: "Corrupt usage restore",
          criteria: [],
        });
      }).pipe(Effect.provide(layer)),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* TheseusDb;
        yield* Effect.sync(() => {
          db.db
            .prepare(
              "INSERT INTO dispatch_snapshots (dispatch_id, iteration, timestamp, messages_json, usage_json) VALUES (?, ?, ?, ?, ?)",
            )
            .run(dispatchId, 0, 1, JSON.stringify([]), JSON.stringify({ inputTokens: "bad" }));
        });
      }).pipe(Effect.provide(TheseusDbLive(dbPath))),
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* TheseusRuntime;
        return yield* RuntimeCommands.startMissionDispatch(runtime, {
          missionId: mission.missionId,
          continueFrom: dispatchId,
          spec: {
            name: "coordinator",
            systemPrompt: "Return final text.",
            tools: [],
          },
          task: "continue",
        }).pipe(
          Effect.as(undefined),
          Effect.catchTag("RuntimeProjectionDecodeFailed", (error) => Effect.succeed(error)),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(failure).toBeInstanceOf(RuntimeProjectionDecodeFailed);
  });

  test("dispatch store list reports corrupt model request JSON as a typed decode failure", async () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "theseus-runtime-")), "theseus.db");
    const layer = Layer.provide(SqliteDispatchStore, TheseusDbLive(dbPath));

    await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* TheseusDb;
        yield* Effect.sync(() => {
          db.db
            .prepare(
              "INSERT INTO dispatch_records (dispatch_id, name, task, parent_dispatch_id, model_request_json) VALUES (?, ?, ?, ?, ?)",
            )
            .run("corrupt-model-request", "coordinator", "finish", null, "{");
        });
      }).pipe(Effect.provide(TheseusDbLive(dbPath))),
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* Dispatch.DispatchStore;
        return yield* store.list().pipe(
          Effect.as(undefined),
          Effect.catchTag("DispatchStoreDecodeFailed", (error) => Effect.succeed(error)),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(failure).toBeInstanceOf(Dispatch.DispatchStoreDecodeFailed);
  });

  test("root runtime import does not export live assembly", async () => {
    const root = await import("../index.ts");
    expect("TheseusRuntimeLive" in root).toBe(false);
  });
});
