/**
 * File system tools: readFile, listDir, searchReplace.
 *
 * searchReplace runs `tsc --noEmit` after every write so the model sees
 * type errors immediately in the same turn and can fix them before moving on.
 *
 * All paths are resolved relative to `workspaceRoot` when they are relative.
 * Absolute paths pass through unchanged.
 */
import { Cause, Effect, Schema } from "effect"
import { existsSync } from "node:fs"
import { resolve, relative, isAbsolute, dirname } from "path"
import type { RegisteredTool } from "./types.ts"

const resolvePath = (workspaceRoot: string, p: string): string =>
  isAbsolute(p) ? p : resolve(workspaceRoot, p)

/**
 * Walk up the directory tree from startDir until a tsconfig.json is found.
 * Returns the absolute path, or undefined if none exists up to the fs root.
 */
const findNearestTsconfig = (startDir: string): string | undefined => {
  let dir = startDir
  while (true) {
    const candidate = resolve(dir, "tsconfig.json")
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ReadFileArgs = Schema.Struct({ path: Schema.String })
const ListDirArgs = Schema.Struct({
  path: Schema.optional(Schema.String),
  deep: Schema.optional(Schema.Boolean),
})
const SearchReplaceArgs = Schema.Struct({
  path: Schema.String,
  search: Schema.String,
  replace: Schema.String,
})

// ---------------------------------------------------------------------------
// readFile
// ---------------------------------------------------------------------------

const makeReadFile = (workspaceRoot: string): RegisteredTool => ({
  definition: {
    type: "function",
    function: {
      name: "readFile",
      description:
        "Read the full contents of a file. Use relative paths from the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path (relative or absolute)" },
        },
        required: ["path"],
      },
    },
  },
  handler: (args) =>
    Effect.gen(function* () {
      const { path } = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(ReadFileArgs)(args),
        catch: (e) => new Error(`readFile: invalid arguments: ${String(e)}`),
      })
      const abs = resolvePath(workspaceRoot, path)
      const content = yield* Effect.tryPromise({
        try: () => Bun.file(abs).text(),
        catch: (e) => new Error(`readFile failed: ${String(e)}`),
      })
      const rel = relative(workspaceRoot, abs)
      return `// ${rel}\n${content}`
    }).pipe(
      Effect.catchCause((cause) => Effect.succeed(`readFile error: ${Cause.pretty(cause)}`)),
    ),
})

// ---------------------------------------------------------------------------
// listDir
// ---------------------------------------------------------------------------

const makeListDir = (workspaceRoot: string): RegisteredTool => ({
  definition: {
    type: "function",
    function: {
      name: "listDir",
      description:
        "List files and directories at a path. Returns one entry per line with a trailing / for directories.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path (relative or absolute). Defaults to workspace root.",
          },
          deep: {
            type: "boolean",
            description:
              "If true, recursively list all files. If false (default), only list immediate children.",
          },
        },
        required: [],
      },
    },
  },
  handler: (args) =>
    Effect.gen(function* () {
      const { path: rawPath, deep } = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(ListDirArgs)(args ?? {}),
        catch: (e) => new Error(`listDir: invalid arguments: ${String(e)}`),
      })
      const resolvedPath: string = rawPath ?? "."
      const abs = resolvePath(workspaceRoot, resolvedPath)
      const entries = yield* Effect.tryPromise({
        try: async () => {
          const glob = new Bun.Glob("**/*")
          const results: string[] = []
          for await (const entry of glob.scan({ cwd: abs, onlyFiles: false })) {
            results.push(entry)
          }
          return results.sort()
        },
        catch: (e) => new Error(`listDir failed: ${String(e)}`),
      })
      const filtered = deep ? entries : entries.filter((e) => !e.includes("/"))
      return filtered.join("\n") || "(empty directory)"
    }).pipe(
      Effect.catchCause((cause) => Effect.succeed(`listDir error: ${Cause.pretty(cause)}`)),
    ),
})

// ---------------------------------------------------------------------------
// searchReplace
// ---------------------------------------------------------------------------

const makeSearchReplace = (workspaceRoot: string): RegisteredTool => ({
  definition: {
    type: "function",
    function: {
      name: "searchReplace",
      description: [
        "Edit a file by replacing an exact block of text with new text.",
        "The `search` string must match the file content exactly (including whitespace and indentation).",
        "Only the first occurrence is replaced. If the search text appears more than once, make it",
        "more specific. After writing, type errors are reported automatically — fix them in the next call.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File to edit (relative or absolute)" },
          search: { type: "string", description: "Exact text to find and replace" },
          replace: { type: "string", description: "Text to substitute in its place" },
        },
        required: ["path", "search", "replace"],
      },
    },
  },
  handler: (args) =>
    Effect.gen(function* () {
      const { path, search, replace } = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(SearchReplaceArgs)(args),
        catch: (e) => new Error(`searchReplace: invalid arguments: ${String(e)}`),
      })
      const abs = resolvePath(workspaceRoot, path)
      const rel = relative(workspaceRoot, abs)

      const original = yield* Effect.tryPromise({
        try: () => Bun.file(abs).text(),
        catch: (e) => new Error(`Cannot read ${rel}: ${String(e)}`),
      })

      if (!original.includes(search)) {
        // Return the full file so the model can find the exact text — hints alone rarely work.
        return [
          `Error: search text not found in ${rel}.`,
          "The current file content is shown below. Find your intended block in it and retry",
          "with the exact text (indentation and whitespace must match character-for-character).",
          "",
          `--- Current content of ${rel} ---`,
          "```",
          original,
          "```",
        ].join("\n")
      }

      const occurrences = original.split(search).length - 1
      if (occurrences > 1) {
        return `Error: search text appears ${occurrences} times in ${rel}. Make it more specific (include more surrounding lines).`
      }

      const updated = original.replace(search, replace)
      yield* Effect.tryPromise({
        try: () => Bun.write(abs, updated),
        catch: (e) => new Error(`Cannot write ${rel}: ${String(e)}`),
      })

      // Compute lines surrounding the replaced block so the model always has
      // an up-to-date view of the file without needing a separate readFile call.
      const CONTEXT_LINES = 4
      const allLines = updated.split("\n")
      const replacePos = updated.indexOf(replace)
      const linesBefore = updated.slice(0, replacePos).split("\n").length - 1
      const replaceLineCount = replace.split("\n").length
      const ctxStart = Math.max(0, linesBefore - CONTEXT_LINES)
      const ctxEnd = Math.min(allLines.length, linesBefore + replaceLineCount + CONTEXT_LINES)
      const surrounding = allLines.slice(ctxStart, ctxEnd).join("\n")
      const lineRange = `lines ${ctxStart + 1}–${ctxEnd}`

      // Find nearest tsconfig.json by walking up from the edited file's directory.
      // This correctly handles monorepos where the workspace root has no tsconfig.
      const tsconfigPath = findNearestTsconfig(dirname(abs))
      if (!tsconfigPath) {
        return [
          `Edit applied to ${rel}. (No tsconfig.json found — type check skipped.)`,
          "",
          `--- ${rel} around change (${lineRange}) ---`,
          "```",
          surrounding,
          "```",
        ].join("\n")
      }

      const tscOut = yield* Effect.tryPromise({
        try: () =>
          Bun.$`tsc --noEmit --project ${tsconfigPath}`
            .cwd(dirname(tsconfigPath))
            .nothrow()
            .text(),
        catch: (e) => new Error(`tsc failed to run: ${String(e)}`),
      }).pipe(Effect.catchCause(() => Effect.succeed("(tsc check failed to run)")))

      const errors = tscOut.trim()
      const header = errors
        ? `Edit applied to ${rel}.\n\nType errors detected:\n${errors}\n\nFix these before moving on.`
        : `Edit applied to ${rel}. No type errors.`
      return [
        header,
        "",
        `--- ${rel} around change (${lineRange}) ---`,
        "```",
        surrounding,
        "```",
      ].join("\n")
    }).pipe(
      Effect.catchCause((cause) => Effect.succeed(`searchReplace error: ${Cause.pretty(cause)}`)),
    ),
})

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const makeFsTools = (workspaceRoot: string): ReadonlyArray<RegisteredTool> => [
  makeReadFile(workspaceRoot),
  makeListDir(workspaceRoot),
  makeSearchReplace(workspaceRoot),
]
