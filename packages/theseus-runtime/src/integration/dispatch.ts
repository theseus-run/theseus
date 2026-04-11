/**
 * Dispatch integration — real LLM via CopilotProvider, streaming events to console.
 *
 * Run:  bun run src/integration/dispatch.ts
 */

import { Effect, Layer, Stream } from "effect";
import type * as Agent from "@theseus.run/core/Agent";
import * as Dispatch from "@theseus.run/core/Dispatch";
import { CopilotLanguageModelLive } from "../providers/copilot-lm.ts";
import { allTools } from "@theseus.run/tools";
import { renderEvent } from "./render.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const coreDir =
  new URL(".", import.meta.url).pathname.replace(/\/integration\/?$/, "");

const blueprint: Agent.Blueprint = {
  name: "explorer",
  systemPrompt:
    "You are a code explorer. Use tools to inspect directories and files, then give a concise summary of what you find.",
  tools: allTools,
  maxIterations: 10,
};

const program = Effect.gen(function* () {
  console.log("Dispatching...\n");

  const handle = yield* Dispatch.dispatch(
    blueprint,
    `List the contents of "${coreDir}" and give me a one-paragraph summary of what primitives are implemented there.`,
  );

  // Drain events to console in the background
  yield* Stream.tap(handle.events, (e) => Effect.sync(() => renderEvent(e))).pipe(
    Stream.runDrain,
    Effect.forkDetach,
  );

  const result = yield* handle.result;

  console.log("\n" + "─".repeat(60));
  console.log(result.content);
  console.log("─".repeat(60));
  console.log(
    `\nUsage: ${result.usage.inputTokens} input tokens, ${result.usage.outputTokens} output tokens`,
  );
});

Effect.runPromise(Effect.provide(program, Layer.merge(CopilotLanguageModelLive, Dispatch.Defaults))).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
