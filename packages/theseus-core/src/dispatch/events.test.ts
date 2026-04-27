import { describe, expect, test } from "bun:test";
import { textPresentation } from "../tool/index.ts";
import { toolResult } from "./events.ts";

describe("DispatchEvents", () => {
  test("ToolResult keeps text content and carries optional structured data", () => {
    const event = toolResult("agent", 1, {
      callId: "call-1",
      name: "probe",
      args: { topic: "runtime" },
      presentation: textPresentation("visible text", {
        structured: { value: 42 },
      }),
      textContent: "visible text",
    });

    expect(event).toMatchObject({
      _tag: "ToolResult",
      content: "visible text",
      structured: { value: 42 },
    });
  });
});
