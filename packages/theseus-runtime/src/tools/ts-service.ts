/**
 * TypeScript Language Service Layer + findReferences tool.
 *
 * Uses the in-process TypeScript Language Service API (ts.createLanguageService)
 * rather than spawning typescript-language-server over stdio. Same underlying
 * compiler, no subprocess overhead, no document-sync protocol.
 *
 * The service is initialised once per session (Effect Layer) and stays warm.
 * After warm-up, getNavigateToItems + getReferencesAtPosition run in ~50ms.
 *
 * Tool handlers close over ts.LanguageService directly (not via yield* TsService)
 * so they satisfy ToolHandler = (args) => Effect.Effect<string, Error> with R=never.
 */
import { Effect, Layer, ServiceMap } from "effect"
import ts from "typescript"
import { statSync, readFileSync } from "fs"
import { dirname, relative, resolve } from "path"
import type { RegisteredTool } from "./types.ts"

// ---------------------------------------------------------------------------
// TsService — Effect service, initialised once per session
// ---------------------------------------------------------------------------

export class TsService extends ServiceMap.Service<
  TsService,
  {
    readonly languageService: ts.LanguageService
    readonly workspaceRoot: string
  }
>()("TsService") {}

export const makeTsServiceLayer = (workspaceRoot: string): Layer.Layer<TsService> =>
  Layer.effect(TsService)(
    Effect.sync(() => {
      const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json")
      if (!configPath) throw new Error(`tsconfig.json not found under ${workspaceRoot}`)

      const { config } = ts.readConfigFile(configPath, ts.sys.readFile)
      const { fileNames, options } = ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        dirname(configPath),
      )

      const host: ts.LanguageServiceHost = {
        getScriptFileNames: () => fileNames,
        // mtime as version — service re-reads files automatically after edits
        getScriptVersion: (fileName) => {
          try {
            return String(statSync(fileName).mtimeMs)
          } catch {
            return "0"
          }
        },
        getScriptSnapshot: (fileName) => {
          try {
            return ts.ScriptSnapshot.fromString(readFileSync(fileName, "utf-8"))
          } catch {
            return undefined
          }
        },
        getCurrentDirectory: () => workspaceRoot,
        getCompilationSettings: () => options,
        getDefaultLibFileName: ts.getDefaultLibFilePath,
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        directoryExists: ts.sys.directoryExists,
        getDirectories: ts.sys.getDirectories,
      }

      return TsService.of({
        languageService: ts.createLanguageService(host, ts.createDocumentRegistry()),
        workspaceRoot,
      })
    }),
  )

// ---------------------------------------------------------------------------
// findReferences tool
// Handler closes over languageService — no Effect R requirements.
// ---------------------------------------------------------------------------

const offsetToLineCol = (
  languageService: ts.LanguageService,
  fileName: string,
  offset: number,
): string => {
  const sf = languageService.getProgram()?.getSourceFile(fileName)
  if (!sf) return `offset:${offset}`
  const { line, character } = ts.getLineAndCharacterOfPosition(sf, offset)
  return `${line + 1}:${character + 1}`
}

export const makeFindReferencesTool = (
  workspaceRoot: string,
  languageService: ts.LanguageService,
): RegisteredTool => ({
  definition: {
    type: "function",
    function: {
      name: "findReferences",
      description: [
        "Find all semantic references to a TypeScript symbol (class, function, method, variable, type, etc.).",
        "Returns file:line:col for every usage. Understands imports, re-exports, and type aliases —",
        "not just text matches.",
        "Use `kind` to disambiguate when the name is shared across many symbols (e.g. `run`, `id`, `name`).",
        "Use `definedIn` to pin the exact definition file when multiple files export the same name.",
        "Prefer shell+grep for distinctive names in small codebases; use this tool when grep would return too much noise.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Name of the symbol (e.g. 'PersistentAgent', 'chat', 'run')",
          },
          kind: {
            type: "string",
            description:
              "Optional. Narrow by symbol kind to cut noise for generic names. " +
              "One of: class, function, method, interface, type, const, let, var, enum, module. " +
              "Omit to match all kinds.",
          },
          definedIn: {
            type: "string",
            description:
              "Optional. Only return references to the symbol defined in this specific file " +
              "(relative path from workspace root, e.g. 'theseus-runtime/src/agent.ts'). " +
              "Use when the same name is exported by multiple files.",
          },
        },
        required: ["symbol"],
      },
    },
  },
  handler: (args) =>
    Effect.gen(function* () {
      const { symbol, kind, definedIn } = args as {
        symbol: string
        kind?: string
        definedIn?: string
      }

      // Resolve definedIn to absolute path for comparison with item.fileName
      const definedInAbs = definedIn ? resolve(workspaceRoot, definedIn) : undefined

      // Step 1: name → definition locations (fetch more candidates so filters have room to work)
      const items = yield* Effect.sync(() =>
        languageService.getNavigateToItems(symbol, 50),
      )

      if (!items || items.length === 0) {
        return `No symbol named "${symbol}" found in the project.`
      }

      // Step 2: filter by kind
      let filtered = [...items]
      if (kind) {
        filtered = filtered.filter((item) => item.kind === kind)
        if (filtered.length === 0) {
          const available = [...new Set(items.map((i) => i.kind))].join(", ")
          return (
            `No symbol named "${symbol}" with kind "${kind}" found. ` +
            `Available kinds for "${symbol}": ${available}`
          )
        }
      }

      // Step 3: filter by definition file
      if (definedInAbs) {
        filtered = filtered.filter((item) => item.fileName === definedInAbs)
        if (filtered.length === 0) {
          const available = [
            ...new Set(items.map((i) => relative(workspaceRoot, i.fileName))),
          ].join(", ")
          return (
            `No symbol "${symbol}" found in file "${definedIn}". ` +
            `"${symbol}" is defined in: ${available}`
          )
        }
      }

      // Step 4: collect all references, deduplicate by file:line:col
      const seen = new Set<string>()
      const lines: string[] = []

      for (const item of filtered) {
        const refs = yield* Effect.sync(() =>
          languageService.getReferencesAtPosition(item.fileName, item.textSpan.start),
        )
        if (!refs) continue

        for (const ref of refs) {
          const lineCol = offsetToLineCol(languageService, ref.fileName, ref.textSpan.start)
          const rel = relative(workspaceRoot, ref.fileName)
          const key = `${rel}:${lineCol}`
          if (seen.has(key)) continue
          seen.add(key)
          lines.push(`${rel}:${lineCol}${ref.isWriteAccess ? " (write)" : ""}`)
        }
      }

      if (lines.length === 0) return `No references found for "${symbol}".`
      return [`References to "${symbol}" (${lines.length}):`, ...lines].join("\n")
    }).pipe(
      Effect.catchCause((cause) => Effect.succeed(`findReferences error: ${cause}`)),
    ),
})

// ---------------------------------------------------------------------------
// Build all TS tools — called with the already-resolved language service
// ---------------------------------------------------------------------------

export const makeTsTools = (
  workspaceRoot: string,
  languageService: ts.LanguageService,
): ReadonlyArray<RegisteredTool> => [makeFindReferencesTool(workspaceRoot, languageService)]
