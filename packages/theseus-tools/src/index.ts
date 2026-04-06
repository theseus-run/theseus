/**
 * @theseus.run/tools — Bun-native tool implementations.
 *
 * Standalone package: usable in MCP servers, agent frameworks, scripts.
 * Each tool is a Tool<I, O> from @theseus.run/core.
 */

export { readFile } from "./read_file.ts";
export { listDir } from "./list_dir.ts";
export { glob } from "./glob.ts";
export { grep } from "./grep.ts";
export { searchReplace } from "./search_replace.ts";
export { writeFile } from "./write_file.ts";
export { shell } from "./shell.ts";
export { outline } from "./outline/index.ts";

// Re-export as collections for toolset assembly
import { readFile } from "./read_file.ts";
import { listDir } from "./list_dir.ts";
import { glob } from "./glob.ts";
import { grep } from "./grep.ts";
import { searchReplace } from "./search_replace.ts";
import { writeFile } from "./write_file.ts";
import { shell } from "./shell.ts";
import { outline } from "./outline/index.ts";

import type { ToolAny } from "@theseus.run/core";

/** Read-only tools — safe for planner/atlas agents. */
export const readonlyTools: ReadonlyArray<ToolAny> = [readFile, listDir, glob, grep, outline];

/** All tools — full access for coder/forge agents. */
export const allTools: ReadonlyArray<ToolAny> = [
  readFile,
  listDir,
  glob,
  grep,
  outline,
  searchReplace,
  writeFile,
  shell,
];
