/**
 * Tools — Bun-native tool implementations for Theseus agents.
 *
 * Each tool is a standalone Tool<I, O> using defineTool from @theseus.run/core.
 * Separate, testable, replaceable.
 */

export { readFile } from "./read_file.ts";
export { listDir } from "./list_dir.ts";
export { glob } from "./glob.ts";
export { grep } from "./grep.ts";
export { searchReplace } from "./search_replace.ts";
export { writeFile } from "./write_file.ts";
export { shell } from "./shell.ts";

// Re-export as collections for toolset assembly
import { readFile } from "./read_file.ts";
import { listDir } from "./list_dir.ts";
import { glob } from "./glob.ts";
import { grep } from "./grep.ts";
import { searchReplace } from "./search_replace.ts";
import { writeFile } from "./write_file.ts";
import { shell } from "./shell.ts";

import type { ToolAny } from "@theseus.run/core";

/** Read-only tools — safe for planner/atlas agents. */
export const readonlyTools: ReadonlyArray<ToolAny> = [readFile, listDir, glob, grep];

/** All tools — full access for coder/forge agents. */
export const allTools: ReadonlyArray<ToolAny> = [
  readFile,
  listDir,
  glob,
  grep,
  searchReplace,
  writeFile,
  shell,
];
