/**
 * Grunt integration — fire-and-forget agent with real LLM, streaming events to console.
 *
 * Run:  bun run packages/theseus-runtime/src/integration/grunt.ts
 */

import { Effect, Match, Stream } from "effect";
import { type Blueprint, type DispatchEvent, grunt } from "@theseus.run/core";
import { CopilotProviderLive } from "../providers/copilot.ts";
import { listDir, readFile } from "./tools.ts";

// ---------------------------------------------------------------------------
// Render event to console
// ---------------------------------------------------------------------------

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

let streamingLine = false;

const renderEvent = (e: DispatchEvent): void => {
  // Close streaming line if switching to a non-delta event
  if (streamingLine && e._tag !== "TextDelta" && e._tag !== "ThinkingDelta") {
    process.stdout.write("\n");
    streamingLine = false;
  }

  Match.value(e).pipe(
    Match.tag("Calling", (e) => {
      console.log(dim(`  [iter ${e.iteration}] calling LLM...`));
    }),
    Match.tag("TextDelta", (e) => {
      process.stdout.write(e.content);
      streamingLine = true;
    }),
    Match.tag("ThinkingDelta", (e) => {
      process.stdout.write(dim(e.content));
      streamingLine = true;
    }),
    Match.tag("Thinking", (e) => {
      if (!streamingLine) {
        const preview = e.content.slice(0, 200);
        const truncated = e.content.length > 200 ? "…" : "";
        console.log(yellow(`  [iter ${e.iteration}] thinking: ${preview}${truncated}`));
      }
    }),
    Match.tag("ToolCalling", (e) => {
      console.log(cyan(`  [iter ${e.iteration}] → ${e.tool}(${JSON.stringify(e.args)})`));
    }),
    Match.tag("ToolResult", (e) => {
      const preview = e.content.slice(0, 120);
      const truncated = e.content.length > 120 ? "…" : "";
      console.log(green(`  [iter ${e.iteration}] ← ${e.tool}: ${preview}${truncated}`));
    }),
    Match.tag("Done", () => {}),
    Match.exhaustive,
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const coreDir = new URL("../../theseus-core/src", import.meta.url).pathname;

const blueprint: Blueprint = {
  name: "explorer",
  systemPrompt:
    "You are a code explorer. Use tools to inspect directories and files, then give a concise summary of what you find.",
  tools: [listDir, readFile],
  maxIterations: 10,
};

const task =
  process.argv[2] ??
  `List the contents of "${coreDir}" and give me a one-paragraph summary of what primitives are implemented there.`;

const program = Effect.gen(function* () {
  console.log(yellow(`\n  grunt "${blueprint.name}" dispatched\n`));

  const handle = yield* grunt(blueprint, task);

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

Effect.runPromise(Effect.provide(program, CopilotProviderLive)).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
