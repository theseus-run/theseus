/**
 * Browser-safe tool metadata.
 *
 * Keep this file free of Bun, WASM, and runtime tool imports. The web UI uses
 * it for descriptions and parameter hints without pulling executable tools into
 * the browser bundle.
 */

import type { ToolInteraction } from "@theseus.run/core/Tool";

type JsonSchema = Record<string, unknown>;

const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: ReadonlyArray<string>,
): JsonSchema => ({
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const stringProp = (description?: string): JsonSchema => ({
  type: "string",
  ...(description ? { description } : {}),
});

const intProp = (
  description: string,
  options?: { readonly minimum?: number; readonly maximum?: number },
): JsonSchema => ({
  type: "integer",
  description,
  ...(options?.minimum !== undefined ? { minimum: options.minimum } : {}),
  ...(options?.maximum !== undefined ? { maximum: options.maximum } : {}),
});

// ---------------------------------------------------------------------------
// Per-tool metadata
// ---------------------------------------------------------------------------

export interface ToolMeta {
  readonly name: string;
  readonly description: string;
  readonly interaction: ToolInteraction;
  /** Compatibility field for the current web UI. Prefer `interaction`. */
  readonly safety: "readonly" | "write" | "destructive";
  readonly inputSchema: JsonSchema;
}

const read_file: ToolMeta = {
  name: "read_file",
  description:
    "Read a file. Returns line-numbered text. Binary files return a type indicator. Use offset/limit for large files.",
  interaction: "observe",
  safety: "readonly",
  inputSchema: objectSchema(
    {
      path: stringProp(),
      offset: intProp("Start at this line number (1-indexed)", { minimum: 1 }),
      limit: intProp("Max lines to return (default 2000)", { minimum: 1 }),
    },
    ["path"],
  ),
};

const list_dir: ToolMeta = {
  name: "list_dir",
  description:
    "List directory contents. Dirs end with /, symlinks with @. Skips node_modules, .git, dist, build, coverage.",
  interaction: "observe",
  safety: "readonly",
  inputSchema: objectSchema({ path: stringProp() }, ["path"]),
};

const glob: ToolMeta = {
  name: "glob",
  description:
    "Find files by glob pattern (e.g. **/*.ts, src/**/*.test.ts). Returns ≤100 paths. Skips node_modules, .git, dist, coverage.",
  interaction: "observe",
  safety: "readonly",
  inputSchema: objectSchema(
    {
      pattern: stringProp(),
      path: stringProp("Root directory to scan (default: cwd)"),
    },
    ["pattern"],
  ),
};

const grep: ToolMeta = {
  name: "grep",
  description:
    "Search file contents by regex. Returns matches grouped by file (file:line:content). ≤100 matches.",
  interaction: "observe",
  safety: "readonly",
  inputSchema: objectSchema(
    {
      pattern: stringProp(),
      path: stringProp("Root directory or file to search (default: cwd)"),
      glob: stringProp("File filter pattern (e.g. *.ts)"),
      context_lines: intProp("Lines of context around each match", { minimum: 0, maximum: 10 }),
    },
    ["pattern"],
  ),
};

const outline: ToolMeta = {
  name: "outline",
  description:
    "Extract symbol outline (functions, classes, types, imports) from a source file. Prefer over read_file for structural understanding. Supports: .ts .tsx .js .jsx .py .go .rs",
  interaction: "observe",
  safety: "readonly",
  inputSchema: objectSchema({ path: stringProp() }, ["path"]),
};

const search_replace: ToolMeta = {
  name: "search_replace",
  description:
    "Replace text in a file. Exact match first, whitespace-normalized fallback. Errors if old text matches in multiple places.",
  interaction: "write",
  safety: "write",
  inputSchema: objectSchema(
    {
      path: stringProp(),
      old: stringProp("Text to find - must match exactly once"),
      new: stringProp("Replacement text (empty string to delete)"),
    },
    ["path", "old", "new"],
  ),
};

const write_file: ToolMeta = {
  name: "write_file",
  description: "Create or overwrite a file. Creates parent directories automatically.",
  interaction: "write_idempotent",
  safety: "write",
  inputSchema: objectSchema({ path: stringProp(), content: stringProp() }, ["path", "content"]),
};

const shell: ToolMeta = {
  name: "shell",
  description:
    "Run a shell command. Returns stdout, stderr, exit code. Default timeout 30s (max 600s). Output capped at 8KB.",
  interaction: "write_destructive",
  safety: "destructive",
  inputSchema: objectSchema(
    {
      command: stringProp(),
      timeout_ms: intProp("Timeout (default 30000, max 600000)", {
        minimum: 1_000,
        maximum: 600_000,
      }),
    },
    ["command"],
  ),
};

// ---------------------------------------------------------------------------
// Lookup map: tool name -> metadata
// ---------------------------------------------------------------------------

export const TOOL_META: Readonly<Record<string, ToolMeta>> = {
  read_file,
  list_dir,
  glob,
  grep,
  outline,
  search_replace,
  write_file,
  shell,
};

export const allToolMeta: ReadonlyArray<ToolMeta> = [
  read_file,
  list_dir,
  glob,
  grep,
  outline,
  search_replace,
  write_file,
  shell,
];
