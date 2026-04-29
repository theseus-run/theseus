import { describe, expect, test } from "bun:test";
import { DispatchEventSchema, RuntimeDispatchEventSchema } from "@theseus.run/core/Rpc";
import { WorkNodeId } from "@theseus.run/runtime";
import { Schema } from "effect";
import { jsonSafe, serializeEvent, serializeRuntimeEvent } from "./serialize.ts";

describe("server serialization", () => {
  test("normalizes undefined values inside opaque JSON payloads", () => {
    expect(jsonSafe({ keep: "value", drop: undefined, nested: { value: undefined } })).toEqual({
      keep: "value",
      nested: {},
    });
    expect(jsonSafe([undefined])).toEqual([null]);
  });

  test("serializes dispatch events with JSON-safe tool args", () => {
    const encoded = Schema.encodeUnknownSync(Schema.toCodecJson(DispatchEventSchema))(
      serializeEvent({
        _tag: "ToolCalling",
        name: "agent",
        iteration: 0,
        tool: "tool",
        args: { keep: "value", drop: undefined },
      }),
    );

    expect(encoded).toEqual({
      _tag: "ToolCalling",
      name: "agent",
      iteration: 0,
      tool: "tool",
      args: { keep: "value" },
    });
  });

  test("serializes runtime events with JSON-safe nested dispatch events", () => {
    const encoded = Schema.encodeUnknownSync(Schema.toCodecJson(RuntimeDispatchEventSchema))(
      serializeRuntimeEvent({
        _tag: "DispatchEvent",
        workNodeId: WorkNodeId.make("work"),
        dispatchId: "dispatch",
        missionId: "mission",
        capsuleId: "capsule",
        event: {
          _tag: "ToolResult",
          name: "agent",
          iteration: 0,
          tool: "tool",
          content: "done",
          isError: false,
          structured: { keep: "value", drop: undefined },
        },
      }),
    );

    expect(encoded).toEqual({
      _tag: "DispatchEvent",
      workNodeId: "work",
      dispatchId: "dispatch",
      missionId: "mission",
      capsuleId: "capsule",
      event: {
        _tag: "ToolResult",
        name: "agent",
        iteration: 0,
        tool: "tool",
        content: "done",
        isError: false,
        structured: { keep: "value" },
      },
    });
  });
});
