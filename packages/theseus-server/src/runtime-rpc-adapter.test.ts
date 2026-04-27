import { describe, expect, test } from "bun:test";
import { TheseusRuntime, type TheseusRuntimeService } from "@theseus.run/runtime";
import { Effect, Layer, Stream } from "effect";
import { RuntimeRpcAdapter, RuntimeRpcAdapterLive } from "./runtime-rpc-adapter.ts";

const session = {
  dispatchId: "dispatch-1",
  missionId: "mission-1",
  capsuleId: "capsule-1",
  name: "coordinator",
  iteration: 0,
  state: "running",
  usage: { inputTokens: 0, outputTokens: 0 },
} as const;

const mission = {
  missionId: "mission-1",
  capsuleId: "capsule-1",
  goal: "prove runtime binding",
  criteria: [],
  state: "pending",
} as const;

const fakeRuntime: TheseusRuntimeService = {
  submit: (command) => {
    if (command._tag === "MissionCreate") {
      return Effect.succeed({ _tag: "MissionCreated", mission });
    }
    return Effect.succeed({
      _tag: "DispatchStarted",
      session,
      events: Stream.make({ _tag: "DispatchSessionStarted", session }),
    });
  },
  control: () => Effect.void,
  query: (query) => {
    if (query._tag === "MissionList") {
      return Effect.succeed({ _tag: "MissionList", missions: [mission] });
    }
    if (query._tag === "DispatchList") {
      return Effect.succeed({ _tag: "DispatchList", dispatches: [session] });
    }
    return Effect.die("unexpected query");
  },
  getSnapshot: () => Effect.succeed({ missions: [mission], active: [session] }),
};

const TestLayer = Layer.provide(
  RuntimeRpcAdapterLive,
  Layer.succeed(TheseusRuntime)(TheseusRuntime.of(fakeRuntime)),
);

describe("RuntimeRpcAdapter", () => {
  test("creates missions through the runtime contract", async () => {
    const created = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        return yield* adapter.createMission({ goal: "prove runtime binding", criteria: [] });
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(created).toEqual(mission);
  });

  test("starts dispatches with session identity first", async () => {
    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const started = yield* adapter.startMissionDispatch({
          missionId: "mission-1",
          spec: { name: "coordinator", systemPrompt: "", tools: [] },
          task: "run",
        });
        const events = yield* Stream.runCollect(started.events);
        return { session: started.session, first: events[0] };
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(observed.session).toEqual(session);
    expect(observed.first).toEqual({ _tag: "DispatchSessionStarted", session });
  });

  test("lists runtime sessions", async () => {
    const listed = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const missions = yield* adapter.listMissions();
        const dispatches = yield* adapter.listRuntimeDispatches();
        return { missions, dispatches };
      }).pipe(Effect.provide(TestLayer)),
    );

    expect(listed).toEqual({ missions: [mission], dispatches: [session] });
  });

  test("starts the server-owned research POC without caller-supplied tools", async () => {
    const commands: string[] = [];
    const runtime: TheseusRuntimeService = {
      ...fakeRuntime,
      submit: (command) => {
        commands.push(command._tag);
        if (command._tag === "MissionCreate") {
          expect(command.input.goal).toBe("inspect repo");
          return Effect.succeed({ _tag: "MissionCreated", mission });
        }
        expect(command.input.spec.name).toBe("poc-research-coordinator");
        expect(command.input.spec.tools).toEqual([{ name: "theseus_dispatch_grunt" }]);
        expect(command.input.spec.modelRequest).toEqual({
          provider: "openai",
          model: "gpt-5.5",
        });
        return Effect.succeed({
          _tag: "DispatchStarted",
          session,
          events: Stream.make({ _tag: "DispatchSessionStarted", session }),
        });
      },
    };
    const layer = Layer.provide(
      RuntimeRpcAdapterLive,
      Layer.succeed(TheseusRuntime)(TheseusRuntime.of(runtime)),
    );

    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* RuntimeRpcAdapter;
        const events = yield* adapter.startResearchPoc("inspect repo");
        return yield* Stream.runCollect(events);
      }).pipe(Effect.provide(layer)),
    );

    expect(commands).toEqual(["MissionCreate", "MissionStartDispatch"]);
    expect(observed[0]).toEqual({ _tag: "MissionCreated", mission });
    expect(observed[1]).toEqual({ _tag: "DispatchSessionStarted", session });
  });
});
