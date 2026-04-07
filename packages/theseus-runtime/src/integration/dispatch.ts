/**
 * Dispatch integration — real LLM via CopilotProvider, streaming events to console.
 *
 * Run:  bun run src/integration/dispatch.ts
 */

import { Effect, Match, Stream } from "effect";
import { type Blueprint, dispatch, type DispatchEvent } from "@theseus.run/core";
import { CopilotLanguageModelLive } from "../providers/copilot-lm.ts";
import { allTools } from "@theseus.run/tools";

// ---------------------------------------------------------------------------
// Render event to console
// ---------------------------------------------------------------------------

let streamingLine = false;

const renderEvent = (e: DispatchEvent): void => {
  if (streamingLine && e._tag !== "TextDelta" && e._tag !== "ThinkingDelta") {
    process.stdout.write("\n");
    streamingLine = false;
  }

  Match.value(e).pipe(
    Match.tag("Calling", (e) => {
      console.log(`  [${e.iteration}] calling LLM...`);
    }),
    Match.tag("TextDelta", (e) => {
      process.stdout.write(e.content);
      streamingLine = true;
    }),
    Match.tag("ThinkingDelta", (e) => {
      process.stdout.write(e.content);
      streamingLine = true;
    }),
    Match.tag("Thinking", (e) => {
      if (!streamingLine) {
        console.log(`  [${e.iteration}] thinking: ${e.content.slice(0, 120)}${e.content.length > 120 ? "…" : ""}`);
      }
    }),
    Match.tag("ToolCalling", (e) => {
      console.log(`  [${e.iteration}] → ${e.tool}(${JSON.stringify(e.args)})`);
    }),
    Match.tag("ToolResult", (e) => {
      console.log(`  [${e.iteration}] ← ${e.tool}: ${e.content.slice(0, 80)}${e.content.length > 80 ? "…" : ""}`);
    }),
    Match.tag("Done", () => {}),
    Match.exhaustive,
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const coreDir =
  new URL(".", import.meta.url).pathname.replace(/\/integration\/?$/, "");

const blueprint: Blueprint = {
  name: "explorer",
  systemPrompt:
    "You are a code explorer. Use tools to inspect directories and files, then give a concise summary of what you find.",
  tools: allTools,
  maxIterations: 10,
};

const program = Effect.gen(function* () {
  console.log("Dispatching...\n");

  const handle = yield* dispatch(
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

Effect.runPromise(Effect.provide(program, CopilotLanguageModelLive)).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
