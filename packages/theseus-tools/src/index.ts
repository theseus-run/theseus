/**
 * @theseus.run/tools — Bun-native tool implementations.
 *
 * Standalone package: usable in MCP servers, agent frameworks, scripts.
 * Each tool is a Tool<I, O> from @theseus.run/core.
 */

export { glob } from "./glob.ts";
export { grep } from "./grep.ts";
export { listDir } from "./list_dir.ts";
export { outline } from "./outline/index.ts";
export { readFile } from "./read_file.ts";
export { searchReplace } from "./search_replace.ts";
export { shell } from "./shell.ts";
export { writeFile } from "./write_file.ts";

import type * as Tool from "@theseus.run/core/Tool";
import { glob } from "./glob.ts";
import { grep } from "./grep.ts";
import { listDir } from "./list_dir.ts";
import { outline } from "./outline/index.ts";
// Re-export as collections for toolset assembly
import { readFile } from "./read_file.ts";
import { searchReplace } from "./search_replace.ts";
import { shell } from "./shell.ts";
import { writeFile } from "./write_file.ts";

/** Read-only tools — safe for planner/atlas agents. */
export const readonlyTools: ReadonlyArray<Tool.ToolAnyWith<never>> = [
  readFile,
  listDir,
  glob,
  grep,
  outline,
];

/** All tools — full access for coder/forge agents. */
export const allTools: ReadonlyArray<Tool.ToolAnyWith<never>> = [
  readFile,
  listDir,
  glob,
  grep,
  outline,
  searchReplace,
  writeFile,
  shell,
];
