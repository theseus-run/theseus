import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { DispatchEventSchema } from "./schemas.ts";

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
