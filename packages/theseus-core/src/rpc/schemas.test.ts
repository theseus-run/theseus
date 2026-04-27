import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  DispatchEventSchema,
  DispatchSessionSchema,
  RuntimeDispatchEventSchema,
} from "./schemas.ts";

describe("DispatchEventSchema", () => {
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
