import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { BlueprintRegistryLive } from "../agent/index.ts";
import { DispatchDefaults } from "../dispatch/defaults.ts";
import { LanguageModelGatewayFromLanguageModel } from "../dispatch/model-gateway.ts";
import { CurrentDispatch, DispatchStore } from "../dispatch/store.ts";
import * as Tool from "../Tool.ts";
import {
  makeMockLanguageModel,
  textParts,
  toolCallParts,
} from "../test-utils/mock-language-model.ts";
import {
  DispatchGruntLauncher,
  DispatchGruntLauncherLive,
  dispatchGruntTool,
} from "./dispatch-grunt.tsx";
import { report } from "./report.ts";
import type { DispatchGruntResult } from "./result.ts";

const baseInput = {
  target: "scout",
  order: {
    objective: "summarize",
    intent: "test protocol capture",
    successCriteria: ["returns summary"],
    bounds: {
      scope: ["summaries only"],
      constraints: ["do not edit files"],
    },
    authority: {
      grantRefs: ["grant:observe"],
      tools: ["read_file"],
    },
  },
};

const testLayer = (responses: Parameters<typeof makeMockLanguageModel>[0]) =>
  Layer.mergeAll(
    BlueprintRegistryLive([
      {
        name: "scout",
        systemPrompt: "You are a scout grunt.",
        tools: [],
      },
    ]),
    Layer.provide(LanguageModelGatewayFromLanguageModel, makeMockLanguageModel(responses)),
    DispatchDefaults,
    Layer.succeed(CurrentDispatch)({
      id: "parent-dispatch" as never,
      name: "parent",
      task: "parent task",
    }),
    Layer.effect(DispatchGruntLauncher)(DispatchGruntLauncherLive),
  );

const successOutput = (outcome: Tool.ToolOutcome<unknown, DispatchGruntResult, unknown>) => {
  if (outcome._tag !== "Success") throw new Error("Expected successful tool outcome");
  return outcome.output;
};

describe("dispatchGruntTool", () => {
  test("captures theseus_report as the terminal protocol packet", async () => {
    const output = await Effect.runPromise(
      Tool.callTool(dispatchGruntTool, baseInput).pipe(
        Effect.provide(
          testLayer([
            toolCallParts([
              {
                id: "report-1",
                name: report.name,
                arguments: JSON.stringify({
                  channel: "complete",
                  summary: "done",
                  content: "summary text",
                  evidence: [{ id: "ev-1", kind: "observation", text: "saw enough" }],
                  artifacts: [
                    {
                      id: "artifact-1",
                      name: "summary.md",
                      type: "document",
                      uri: "memory://summary.md",
                      criteriaRefs: ["returns summary"],
                      final: true,
                    },
                  ],
                  satisfaction: [
                    {
                      criterion: "returns summary",
                      status: "satisfied",
                      evidenceRefs: ["ev-1"],
                    },
                  ],
                }),
              },
            ]),
            textParts("ignored final text"),
          ]),
        ),
      ),
    );

    const result = successOutput(output);
    expect(result._tag).toBe("Reported");
    if (result._tag !== "Reported") return;
    expect(result.target).toBe("scout");
    expect(typeof result.dispatchId).toBe("string");
    expect(result.report.channel).toBe("complete");
    expect(result.report.content).toBe("summary text");
    expect(result.report.artifacts?.[0]?.name).toBe("summary.md");
    expect(result.report.satisfaction?.[0]?.status).toBe("satisfied");
  });

  test("starts the grunt as a child dispatch", async () => {
    const observed = await Effect.runPromise(
      Effect.gen(function* () {
        const outcome = yield* Tool.callTool(dispatchGruntTool, baseInput);
        const store = yield* DispatchStore;
        const summaries = yield* store.list();
        return { outcome, summaries };
      }).pipe(
        Effect.provide(
          testLayer([
            toolCallParts([
              {
                id: "report-parent-link",
                name: report.name,
                arguments: JSON.stringify({
                  channel: "complete",
                  summary: "done",
                  content: "summary text",
                }),
              },
            ]),
            textParts("ignored final text"),
          ]),
        ),
      ),
    );

    const result = successOutput(observed.outcome);
    expect(result._tag).toBe("Reported");
    expect(observed.summaries[0]?.parentDispatchId).toBe("parent-dispatch");
  });

  test("treats null optional order arrays as absent", async () => {
    const output = await Effect.runPromise(
      Tool.callTool(dispatchGruntTool, {
        target: "scout",
        order: {
          objective: "summarize",
          successCriteria: ["returns summary"],
          authority: {
            grantRefs: null,
            actions: null,
            tools: ["read_file"],
            limits: null,
            escalation: null,
          },
        },
      }).pipe(
        Effect.provide(
          testLayer([
            toolCallParts([
              {
                id: "report-null-authority",
                name: report.name,
                arguments: JSON.stringify({
                  channel: "complete",
                  summary: "done",
                  content: "summary text",
                }),
              },
            ]),
            textParts("ignored final text"),
          ]),
        ),
      ),
    );

    const result = successOutput(output);
    expect(result._tag).toBe("Reported");
  });

  test("captures reports with null optional report arrays", async () => {
    const output = await Effect.runPromise(
      Tool.callTool(dispatchGruntTool, baseInput).pipe(
        Effect.provide(
          testLayer([
            toolCallParts([
              {
                id: "report-null-fields",
                name: report.name,
                arguments: JSON.stringify({
                  channel: "complete",
                  summary: "done",
                  content: "summary text",
                  evidence: null,
                  artifacts: null,
                  satisfaction: null,
                }),
              },
            ]),
            textParts("ignored final text"),
          ]),
        ),
      ),
    );

    const result = successOutput(output);
    expect(result._tag).toBe("Reported");
  });

  test("returns unstructured salvage when no valid report is captured", async () => {
    const output = await Effect.runPromise(
      Tool.callTool(dispatchGruntTool, baseInput).pipe(
        Effect.provide(testLayer([textParts("freeform result")])),
      ),
    );

    const result = successOutput(output);
    expect(result._tag).toBe("Unstructured");
    if (result._tag !== "Unstructured") return;
    expect(result.reason).toContain(report.name);
    expect(result.salvage.content).toBe("freeform result");
  });

  test("treats blocked and defect reports as successful protocol outputs", async () => {
    for (const channel of ["blocked", "defect"] as const) {
      const output = await Effect.runPromise(
        Tool.callTool(dispatchGruntTool, baseInput).pipe(
          Effect.provide(
            testLayer([
              toolCallParts([
                {
                  id: `report-${channel}`,
                  name: report.name,
                  arguments: JSON.stringify({
                    channel,
                    summary: channel,
                    content: `${channel} content`,
                  }),
                },
              ]),
              textParts("after report"),
            ]),
          ),
        ),
      );

      const result = successOutput(output);
      expect(result._tag).toBe("Reported");
      if (result._tag !== "Reported") return;
      expect(result.report.channel).toBe(channel);
    }
  });
});
