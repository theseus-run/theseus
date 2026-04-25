import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { BlueprintRegistryLive } from "../agent/index.ts";
import * as Tool from "../Tool.ts";
import { makeMockLanguageModel, toolCallParts } from "../test-utils/mock-language-model.ts";
import { dispatchGruntTool } from "./dispatch-grunt.tsx";
import { report } from "./report.ts";

describe("dispatchGruntTool", () => {
  test("dispatches a runtime-owned blueprint by name", async () => {
    const output = await Effect.runPromise(
      Tool.call(dispatchGruntTool, {
        blueprint: "worker",
        task: "summarize",
        criteria: ["returns summary"],
      }).pipe(
        Effect.provide(
          Layer.merge(
            BlueprintRegistryLive([
              {
                name: "worker",
                systemPrompt: "You are a worker.",
                tools: [],
              },
            ]),
            makeMockLanguageModel([
              toolCallParts([
                {
                  id: "report-1",
                  name: report.name,
                  arguments: JSON.stringify({
                    result: "success",
                    summary: "done",
                    content: "summary text",
                  }),
                },
              ]),
            ]),
          ),
        ),
      ),
    );

    const text = output.content
      .map((content) => (content._tag === "text" ? content.text : ""))
      .join("");
    expect(text).toContain("[success] done");
    expect(text).toContain("summary text");
  });
});
