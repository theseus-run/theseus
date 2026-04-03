/**
 * Grunt integration test — real LLM via CopilotProvider.
 *
 * Run:  bun run src/primitives/grunt/integration.ts
 *
 * Uses listDir + readFile tools. Asks the model to explore the primitives
 * directory and report what's there. Exercises the full tool-call loop.
 */

import { readdirSync, readFileSync } from "node:fs";
import { Effect, Layer } from "effect";
import type { Blueprint } from "../agent/index.ts";
import { defineTool, manualSchema } from "../tool/index.ts";
import { dispatch } from "./index.ts";
import { CopilotProviderLive } from "../../providers/copilot.ts";

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const listDir = defineTool<{ path: string }, string>({
  name: "listDir",
  description: "List files and directories at the given path. Returns newline-separated names.",
  inputSchema: manualSchema(
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    (raw) => {
      const r = raw as { path?: unknown };
      if (typeof r.path !== "string") throw new Error("path must be a string");
      return r as { path: string };
    },
  ),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path }, { fail }) =>
    Effect.try({
      try: () => readdirSync(path).join("\n"),
      catch: (e) => fail(`Cannot list ${path}: ${e}`),
    }),
  encode: (s) => s,
});

const readFile = defineTool<{ path: string }, string>({
  name: "readFile",
  description: "Read the contents of a file at the given path.",
  inputSchema: manualSchema(
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    (raw) => {
      const r = raw as { path?: unknown };
      if (typeof r.path !== "string") throw new Error("path must be a string");
      return r as { path: string };
    },
  ),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path }, { fail }) =>
    Effect.try({
      try: () => readFileSync(path, "utf-8"),
      catch: (e) => fail(`Cannot read ${path}: ${e}`),
    }),
  encode: (s) => s,
});

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------

const blueprint: Blueprint = {
  name: "explorer",
  systemPrompt:
    "You are a code explorer. Use tools to inspect directories and files, then give a concise summary of what you find.",
  tools: [listDir, readFile],
  maxIterations: 10,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const primitivesDir =
  new URL(".", import.meta.url).pathname.replace(/\/grunt\/?$/, "");

const program = Effect.gen(function* () {
  console.log(`\nDispatching to model via CopilotProvider...\n`);

  const result = yield* dispatch(
    blueprint,
    `List the contents of "${primitivesDir}" and give me a one-paragraph summary of what primitives are implemented there.`,
  );

  console.log("─".repeat(60));
  console.log(result.content);
  console.log("─".repeat(60));
  console.log(
    `\nUsage: ${result.usage.inputTokens} input tokens, ${result.usage.outputTokens} output tokens`,
  );
});

Effect.runPromise(Effect.provide(program, CopilotProviderLive)).catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
