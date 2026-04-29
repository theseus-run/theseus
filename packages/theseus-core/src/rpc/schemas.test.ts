import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  DispatchEventSchema,
  DispatchSessionSchema,
  RuntimeDispatchEventSchema,
} from "./schemas.ts";

const dispatchControl = {
  interrupt: { _tag: "Supported" },
  injectGuidance: { _tag: "Supported" },
  pause: { _tag: "Unsupported", reason: "dispatch pause is not implemented" },
  resume: { _tag: "Unsupported", reason: "dispatch resume is not implemented" },
  stop: { _tag: "Supported" },
  requestStatus: { _tag: "Supported" },
} as const;

describe("DispatchEventSchema", () => {
  test("preserves CortexRendered frame metadata on the wire", async () => {
    const event = {
      _tag: "CortexRendered",
      name: "runner",
      iteration: 1,
      signals: [
        {
          id: "root-agents-md:AGENTS.md",
          nodeId: "root-agents-md",
          slot: "workspace",
          authority: "developer",
          priority: 0,
          text: "Follow workspace rules.",
        },
      ],
      historyMessageCount: 2,
      cortexMessageCount: 1,
      promptMessageCount: 3,
    } as const;

    await expect(
      Effect.runPromise(Schema.decodeUnknownEffect(DispatchEventSchema)(event)),
    ).resolves.toEqual(event);
  });

  test("preserves ToolResult isError on the wire", async () => {
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(DispatchEventSchema)({
        _tag: "ToolResult",
        name: "runner",
        iteration: 1,
        tool: "read_file",
        content: "blocked",
        isError: true,
      }),
    );

    expect(decoded).toEqual({
      _tag: "ToolResult",
      name: "runner",
      iteration: 1,
      tool: "read_file",
      content: "blocked",
      isError: true,
    });
  });
});

describe("runtime RPC schemas", () => {
  test("DispatchSessionSchema includes mission and capsule identity", async () => {
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(DispatchSessionSchema)({
        workNodeId: "work-1",
        dispatchId: "dispatch-1",
        missionId: "mission-1",
        capsuleId: "capsule-1",
        kind: "dispatch",
        relation: "root",
        label: "coordinator",
        control: dispatchControl,
        name: "coordinator",
        iteration: 2,
        state: "running",
        usage: { inputTokens: 10, outputTokens: 4 },
      }),
    );

    expect(decoded).toMatchObject({
      dispatchId: "dispatch-1",
      missionId: "mission-1",
      capsuleId: "capsule-1",
    });
  });

  test("runtime session schemas accept null optional wire fields", async () => {
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(DispatchSessionSchema)({
        workNodeId: "work-1",
        dispatchId: "dispatch-1",
        missionId: "mission-1",
        capsuleId: "capsule-1",
        parentWorkNodeId: null,
        kind: "dispatch",
        relation: "root",
        label: "coordinator",
        control: dispatchControl,
        startedAt: null,
        completedAt: null,
        name: "coordinator",
        modelRequest: {
          provider: "copilot",
          model: "gpt-5.4",
          maxTokens: null,
        },
        iteration: 0,
        state: "running",
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    );

    expect(decoded.parentWorkNodeId).toBeNull();
    expect(decoded.startedAt).toBeNull();
    expect(decoded.modelRequest).toEqual({
      provider: "copilot",
      model: "gpt-5.4",
      maxTokens: null,
    });
  });

  test("RuntimeDispatchEventSchema preserves session start and wrapped dispatch events", async () => {
    const started = {
      _tag: "DispatchSessionStarted",
      session: {
        workNodeId: "work-1",
        dispatchId: "dispatch-1",
        missionId: "mission-1",
        capsuleId: "capsule-1",
        kind: "dispatch",
        relation: "root",
        label: "coordinator",
        control: dispatchControl,
        name: "coordinator",
        iteration: 0,
        state: "running",
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    } as const;
    const wrapped = {
      _tag: "DispatchEvent",
      workNodeId: "work-1",
      dispatchId: "dispatch-1",
      missionId: "mission-1",
      capsuleId: "capsule-1",
      event: {
        _tag: "ToolResult",
        name: "coordinator",
        iteration: 1,
        tool: "read_file",
        content: "missing",
        isError: true,
      },
    } as const;

    await expect(
      Effect.runPromise(Schema.decodeUnknownEffect(RuntimeDispatchEventSchema)(started)),
    ).resolves.toEqual(started);
    await expect(
      Effect.runPromise(Schema.decodeUnknownEffect(RuntimeDispatchEventSchema)(wrapped)),
    ).resolves.toEqual(wrapped);
  });
});
