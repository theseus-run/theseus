/**
 * Shared event rendering for integration scripts.
 */

import { Match } from "effect";
import type { DispatchEvent } from "@theseus.run/core";

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

/** Truncate string for display. */
export const truncateDisplay = (s: string, max = 100): string =>
  s.length > max ? `${s.slice(0, max)}…` : s;

// ---------------------------------------------------------------------------
// Event renderer
// ---------------------------------------------------------------------------

let streamingLine = false;

export const renderEvent = (e: DispatchEvent): void => {
  if (streamingLine && e._tag !== "TextDelta" && e._tag !== "ThinkingDelta") {
    process.stdout.write("\n");
    streamingLine = false;
  }

  Match.value(e).pipe(
    Match.tag("Calling", (e) => console.log(dim(`  [${e.agent} iter ${e.iteration}] calling LLM...`))),
    Match.tag("TextDelta", (e) => { process.stdout.write(e.content); streamingLine = true; }),
    Match.tag("ThinkingDelta", (e) => { process.stdout.write(dim(e.content)); streamingLine = true; }),
    Match.tag("Thinking", () => {}),
    Match.tag("ToolCalling", (e) => console.log(cyan(`  [${e.agent}] → ${e.tool}(${truncateDisplay(JSON.stringify(e.args), 120)})`))),
    Match.tag("ToolResult", (e) => console.log(green(`  [${e.agent}] ← ${e.tool}: ${truncateDisplay(e.content)}`))),
    Match.tag("ToolError", (e) => console.log(yellow(`  [${e.agent}] ⚠ ${e.tool}: ${e.error._tag}`))),
    Match.tag("Done", () => {}),
    Match.exhaustive,
  );
};
