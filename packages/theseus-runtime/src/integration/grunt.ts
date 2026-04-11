/**
 * Grunt integration — fire-and-forget agent with real LLM, streaming events to console.
 *
 * Run:  bun run packages/theseus-runtime/src/integration/grunt.ts
 */

import { Effect, Layer, Stream } from "effect";
import type * as Agent from "@theseus.run/core/Agent";
import * as Grunt from "@theseus.run/core/Grunt";
import * as Satellite from "@theseus.run/core/Satellite";
import { CopilotLanguageModelLive } from "../providers/copilot-lm.ts";
import { allTools } from "@theseus.run/tools";
import { renderEvent, dim, yellow } from "./render.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const coreDir = new URL("../../theseus-core/src", import.meta.url).pathname;

const blueprint: Agent.Blueprint = {
  name: "explorer",
  systemPrompt:
    "You are a code explorer. Use tools to inspect directories and files, then give a concise summary of what you find.",
  tools: allTools,
  maxIterations: 10,
};

const task =
  process.argv[2] ??
  `List the contents of "${coreDir}" and give me a one-paragraph summary of what primitives are implemented there.`;

const program = Effect.gen(function* () {
  console.log(yellow(`\n  grunt "${blueprint.name}" dispatched\n`));

  const handle = yield* Grunt.grunt(blueprint, task);

  // Drain events to console
  yield* Stream.tap(handle.events, (e) => Effect.sync(() => renderEvent(e))).pipe(
    Stream.runDrain,
    Effect.forkDetach,
  );

  const result = yield* handle.result;

  console.log(`\n${"─".repeat(60)}`);
  console.log(result.content);
  console.log("─".repeat(60));
  console.log(
    dim(`\n  tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out\n`),
  );
});

Effect.runPromise(Effect.provide(program, Layer.merge(CopilotLanguageModelLive, Satellite.DefaultRing))).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
