import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { decodeReportInput } from "../agent-comm/report.ts";
import { defineTool } from "./index.ts";
import { makeToolkit, withMaxInteraction } from "./toolkit.ts";

describe("tool boundary", () => {
  test("report input decoder rejects invalid terminal payloads", async () => {
    const error = await Effect.runPromise(
      Effect.flip(decodeReportInput({ result: "bogus", summary: "bad", content: "bad" })),
    );

    expect(String(error)).toContain("Expected");
  });

  test("withMaxInteraction filters tools above the requested policy", () => {
    const observeTool = defineTool<{ path: string }>({
      name: "observe_test",
      description: "Observe.",
      input: Schema.Struct({ path: Schema.String }),
      policy: { interaction: "observe" },
      execute: ({ path }) => Effect.succeed(path),
    });

    const writeTool = defineTool<{ path: string }>({
      name: "write_test",
      description: "Write.",
      input: Schema.Struct({ path: Schema.String }),
      policy: { interaction: "write" },
      execute: ({ path }) => Effect.succeed(path),
    });

    const toolkit = withMaxInteraction(makeToolkit(observeTool, writeTool), "observe");

    expect(toolkit.tools.map((tool) => tool.name)).toEqual(["observe_test"]);
  });
});
