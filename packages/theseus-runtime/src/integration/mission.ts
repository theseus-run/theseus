/**
 * Mission integration — full e2e: Mission → orchestrator → delegate → grunt → report → done.
 *
 * Uses the AgentComm protocol:
 *   theseus.delegate — orchestrator dispatches worker with structured briefing
 *   theseus.report   — worker terminates with structured result
 *
 * Run: bun run packages/theseus-runtime/src/integration/mission.ts
 *
 * @jsxImportSource @theseus.run/jsx-md
 */

import { Effect, Layer, Match, Stream } from "effect";
import {
  type Blueprint,
  Capsule,
  CapsuleLive,
  type DispatchEvent,
  grunt,
  MissionContext,
  MissionId,
  MissionLive,
  type MissionConfig,
} from "@theseus.run/core";
import { readonlyTools } from "@theseus.run/tools";
import { makeDelegate } from "@theseus.run/core";
import { CopilotLanguageModelLive } from "../providers/copilot-lm.ts";

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// ---------------------------------------------------------------------------
// Event renderer
// ---------------------------------------------------------------------------

let streamingLine = false;

const renderEvent = (e: DispatchEvent): void => {
  if (streamingLine && e._tag !== "TextDelta" && e._tag !== "ThinkingDelta") {
    process.stdout.write("\n");
    streamingLine = false;
  }

  Match.value(e).pipe(
    Match.tag("Calling", (e) => console.log(dim(`  [${e.agent} iter ${e.iteration}] calling LLM...`))),
    Match.tag("TextDelta", (e) => { process.stdout.write(e.content); streamingLine = true; }),
    Match.tag("ThinkingDelta", (e) => { process.stdout.write(dim(e.content)); streamingLine = true; }),
    Match.tag("Thinking", () => {}),
    Match.tag("ToolCalling", (e) => console.log(cyan(`  [${e.agent}] → ${e.tool}(${JSON.stringify(e.args).slice(0, 120)})`))),
    Match.tag("ToolResult", (e) => console.log(green(`  [${e.agent}] ← ${e.tool}: ${e.content.slice(0, 100)}${e.content.length > 100 ? "…" : ""}`))),
    Match.tag("Done", () => {}),
    Match.exhaustive,
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const program = Effect.gen(function* () {
  const missionConfig: MissionConfig = {
    id: MissionId("explore-core"),
    goal: process.argv[2] ?? "Explore the theseus-core package and summarize what primitives are implemented.",
    criteria: [
      "Lists all primitives found",
      "Describes what each primitive does in one sentence",
    ],
  };

  console.log(bold(yellow(`\n  Mission: ${missionConfig.id}`)));
  console.log(dim(`  Goal: ${missionConfig.goal}`));
  console.log(dim(`  Criteria: ${missionConfig.criteria.join("; ")}\n`));

  // Capsule-first: provide Capsule, then Mission on top
  const capsuleLayer = CapsuleLive(missionConfig.id);
  const missionLayer = Layer.provide(MissionLive(missionConfig), capsuleLayer);
  const fullLayer = Layer.merge(capsuleLayer, missionLayer);

  yield* Effect.provide(
    Effect.gen(function* () {
      const ctx = yield* MissionContext;
      const capsule = yield* Capsule;

      const mission = yield* ctx.mission;
      console.log(dim(`  Status: ${mission.status}`));

      // Transition to running (approval gate)
      yield* ctx.transition("running");
      console.log(dim(`  Status: running\n`));

      // Build the worker blueprint (grunt with file tools + theseus.report)
      const workerBlueprint: Blueprint = {
        name: "explorer",
        systemPrompt: "You are a code explorer. Use tools to inspect directories and files. Be concise and factual.",
        tools: readonlyTools,
        maxIterations: 8,
      };

      // Build the theseus.delegate tool (closes over LanguageModel + Capsule + worker)
      const delegateTool = yield* makeDelegate(workerBlueprint);

      // Build the orchestrator blueprint
      const orchestratorBlueprint: Blueprint = {
        name: "theseus",
        systemPrompt: [
          "You are Theseus, a mission orchestrator.",
          `Mission goal: ${mission.goal}`,
          `Success criteria: ${mission.criteria.join("; ")}`,
          "",
          "You have a theseus.delegate tool that dispatches a worker agent.",
          "Provide a clear task, measurable criteria, and relevant context.",
          "The worker will report back with structured results.",
          "Do NOT try to read files yourself — delegate to the worker.",
        ].join("\n"),
        tools: [delegateTool],
        maxIterations: 5,
      };

      // Dispatch the orchestrator
      const handle = yield* grunt(orchestratorBlueprint, mission.goal);

      yield* Stream.tap(handle.events, (e) => Effect.sync(() => renderEvent(e))).pipe(
        Stream.runDrain,
        Effect.forkDetach,
      );

      const result = yield* handle.result;

      // Log result to capsule
      yield* capsule.log({
        type: "mission.result",
        by: "theseus",
        data: { result: result.result, summary: result.summary },
      });

      // Transition to done
      yield* ctx.transition("done");

      // Print result
      console.log(`\n${"─".repeat(60)}`);
      console.log(`[${result.result}] ${result.summary}`);
      console.log(result.content);
      console.log("─".repeat(60));

      // Print capsule trail
      const events = yield* capsule.read();
      console.log(dim(`\n  Capsule events (${events.length}):`));
      events.forEach((e) => console.log(dim(`    ${e.type} by ${e.by} at ${e.at.slice(11, 19)}`)));

      const finalMission = yield* ctx.mission;
      console.log(bold(green(`\n  Mission ${finalMission.id}: ${finalMission.status}\n`)));
    }),
    fullLayer,
  );
});

Effect.runPromise(Effect.provide(program, CopilotLanguageModelLive)).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
