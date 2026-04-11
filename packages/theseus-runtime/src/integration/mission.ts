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

import { Effect, Layer, Stream } from "effect";
import type * as Agent from "@theseus.run/core/Agent";
import * as Capsule from "@theseus.run/core/Capsule";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Grunt from "@theseus.run/core/Grunt";
import * as Satellite from "@theseus.run/core/Satellite";
import * as Mission from "@theseus.run/core/Mission";
import * as AgentComm from "@theseus.run/core/AgentComm";
import { readonlyTools } from "@theseus.run/tools";
import { CopilotLanguageModelLive } from "../providers/copilot-lm.ts";
import { renderEvent, dim, bold, yellow, green } from "./render.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const program = Effect.gen(function* () {
  const missionConfig: Mission.Config = {
    id: yield* Mission.makeId("explore-core"),
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
  const capsuleLayer = Capsule.Live(missionConfig.id);
  const missionLayer = Layer.provide(Mission.Live(missionConfig), capsuleLayer);
  const fullLayer = Layer.merge(capsuleLayer, missionLayer);

  yield* Effect.provide(
    Effect.gen(function* () {
      const ctx = yield* Mission.Context;
      const capsule = yield* Capsule.Capsule;

      const mission = yield* ctx.mission;
      console.log(dim(`  Status: ${mission.status}`));

      // Transition to running (approval gate)
      yield* ctx.transition("running");
      console.log(dim(`  Status: running\n`));

      // Build the worker blueprint (grunt with file tools + theseus.report)
      const workerBlueprint: Agent.Blueprint = {
        name: "explorer",
        systemPrompt: "You are a code explorer. Use tools to inspect directories and files. Be concise and factual.",
        tools: readonlyTools,
        maxIterations: 8,
      };

      // Build the theseus.delegate tool (closes over LanguageModel + Capsule + worker)
      const delegateTool = yield* AgentComm.makeDelegate(workerBlueprint);

      // Build the orchestrator blueprint
      const orchestratorBlueprint: Agent.Blueprint = {
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
      const handle = yield* Grunt.grunt(orchestratorBlueprint, mission.goal);

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

Effect.runPromise(Effect.provide(program, Layer.merge(Layer.merge(CopilotLanguageModelLive, Satellite.DefaultRing), Dispatch.NoopLog))).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
