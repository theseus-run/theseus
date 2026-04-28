import { describe, expect, test } from "bun:test";
import { textPresentation } from "../tool/index.ts";
import { CortexSignals } from "./cortex.ts";
import { cortexRendered, isTerminal, toolResult } from "./events.ts";

describe("DispatchEvents", () => {
  test("CortexRendered captures iteration prompt frame metadata", () => {
    const event = cortexRendered("agent", 2, 3, {
      signals: [
        CortexSignals.text({
          id: "root-agents-md:AGENTS.md",
          nodeId: "root-agents-md",
          slot: "workspace",
          authority: "developer",
          text: "Follow the rules.",
        }),
      ],
      messages: [
        { role: "system", content: "Follow the rules." },
        { role: "user", content: "task" },
        { role: "assistant", content: "prior" },
        { role: "tool", content: [] },
      ],
    });

    expect(event).toEqual({
      _tag: "CortexRendered",
      name: "agent",
      iteration: 2,
      signals: [
        {
          id: "root-agents-md:AGENTS.md",
          nodeId: "root-agents-md",
          slot: "workspace",
          authority: "developer",
          priority: 0,
          text: "Follow the rules.",
        },
      ],
      historyMessageCount: 3,
      cortexMessageCount: 1,
      promptMessageCount: 4,
    });
    expect(isTerminal(event)).toBe(false);
  });

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
