import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { decodeReportInput } from "../agent-comm/report.ts";

describe("tool boundary", () => {
  test("report input decoder rejects invalid terminal payloads", async () => {
    const error = await Effect.runPromise(
      Effect.flip(decodeReportInput({ result: "bogus", summary: "bad", content: "bad" })),
    );

    expect(String(error)).toContain("Expected");
  });
});
