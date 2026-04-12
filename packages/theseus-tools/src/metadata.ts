/**
 * metadata.ts — browser-safe tool metadata.
 *
 * Exports static name/description/inputSchema for each tool.
 * No Bun, no Effect, no WASM — safe to import in browser bundles.
 * The inputSchema JSON is computed once from Zod (includes .describe() annotations).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Helper — compute JSON Schema from a Zod object (Zod 4 built-in)
// ---------------------------------------------------------------------------

function schema<T extends z.ZodTypeAny>(s: T) {
  return z.toJSONSchema(s, { target: "draft-07" }) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Per-tool metadata
// ---------------------------------------------------------------------------

export interface ToolMeta {
  readonly name: string;
  readonly description: string;
  readonly safety: "readonly" | "write" | "destructive";
  readonly inputSchema: Record<string, unknown>;
}

const read_file: ToolMeta = {
  name: "read_file",
  description:
    "Read a file. Returns line-numbered text. Binary files return a type indicator. Use offset/limit for large files.",
  safety: "readonly",
  inputSchema: schema(
    z.object({
      path: z.string().min(1),
      offset: z.number().int().min(1).optional().describe("Start at this line number (1-indexed)"),
      limit: z.number().int().min(1).optional().describe("Max lines to return (default 2000)"),
    }),
  ),
};

const list_dir: ToolMeta = {
  name: "list_dir",
  description:
    "List directory contents. Dirs end with /, symlinks with @. Skips node_modules, .git, dist, build, coverage.",
  safety: "readonly",
  inputSchema: schema(
    z.object({
      path: z.string().min(1),
    }),
  ),
};

const glob: ToolMeta = {
  name: "glob",
  description:
    "Find files by glob pattern (e.g. **/*.ts, src/**/*.test.ts). Returns ≤100 paths. Skips node_modules, .git, dist, coverage.",
  safety: "readonly",
  inputSchema: schema(
    z.object({
      pattern: z.string().min(1),
      path: z.string().min(1).optional().describe("Root directory to scan (default: cwd)"),
    }),
  ),
};

const grep: ToolMeta = {
  name: "grep",
  description:
    "Search file contents by regex. Returns matches grouped by file (file:line:content). ≤100 matches.",
  safety: "readonly",
  inputSchema: schema(
    z.object({
      pattern: z.string().min(1),
      path: z
        .string()
        .min(1)
        .optional()
        .describe("Root directory or file to search (default: cwd)"),
      glob: z.string().optional().describe("File filter pattern (e.g. *.ts)"),
      context_lines: z
        .number()
        .int()
        .min(0)
        .max(10)
        .optional()
        .describe("Lines of context around each match"),
    }),
  ),
};

const outline: ToolMeta = {
  name: "outline",
  description:
    "Extract symbol outline (functions, classes, types, imports) from a source file. Prefer over read_file for structural understanding. Supports: .ts .tsx .js .jsx .py .go .rs",
  safety: "readonly",
  inputSchema: schema(
    z.object({
      path: z.string().min(1),
    }),
  ),
};

const search_replace: ToolMeta = {
  name: "search_replace",
  description:
    "Replace text in a file. Exact match first, whitespace-normalized fallback. Errors if old text matches in multiple places.",
  safety: "write",
  inputSchema: schema(
    z.object({
      path: z.string().min(1),
      old: z.string().min(1).describe("Text to find — must match exactly once"),
      new: z.string().describe("Replacement text (empty string to delete)"),
    }),
  ),
};

const write_file: ToolMeta = {
  name: "write_file",
  description: "Create or overwrite a file. Creates parent directories automatically.",
  safety: "write",
  inputSchema: schema(
    z.object({
      path: z.string().min(1),
      content: z.string(),
    }),
  ),
};

const shell: ToolMeta = {
  name: "shell",
  description:
    "Run a shell command. Returns stdout, stderr, exit code. Default timeout 30s (max 600s). Output capped at 8KB.",
  safety: "destructive",
  inputSchema: schema(
    z.object({
      command: z.string().min(1),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .max(600_000)
        .optional()
        .describe("Timeout (default 30000, max 600000)"),
    }),
  ),
};

// ---------------------------------------------------------------------------
// Lookup map: tool name → metadata
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
