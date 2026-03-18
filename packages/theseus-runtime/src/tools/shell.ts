/**
 * Shell tool — run arbitrary shell commands via Bun.$.
 *
 * The command string is passed to `sh -c` so pipelines, redirects, and
 * semicolons all work. Output is capped at 8 KB to avoid flooding context.
 *
 * Intended for: bun test, git diff, git log, rg, find — anything that
 * doesn't have a dedicated semantic tool.
 */
import { Cause, Effect, Schema } from "effect"
import type { RegisteredTool } from "./types.ts"
import { Config } from "../config.ts"

const truncate = (s: string): string => {
  const MAX_OUTPUT = Config.shellMaxOutput
  return s.length > MAX_OUTPUT
    ? s.slice(0, MAX_OUTPUT) + `\n... (truncated — ${s.length - MAX_OUTPUT} bytes omitted)`
    : s
}

const ShellArgs = Schema.Struct({ command: Schema.String })

export const makeShellTool = (workspaceRoot: string): RegisteredTool => ({
  definition: {
    type: "function",
    function: {
      name: "shell",
      description: [
        "Run a shell command and return stdout + stderr.",
        "Use for: bun test, git operations, ripgrep (rg), find, tsc --noEmit.",
        "Prefer readFile / listDir / findReferences for code navigation — shell is the fallback.",
        "Commands run from the workspace root.",
      ].join(" "),
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to run (passed to sh -c)",
          },
        },
        required: ["command"],
      },
    },
  },
  handler: (args) =>
    Effect.gen(function* () {
      const { command } = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(ShellArgs)(args),
        catch: (e) => new Error(`shell: invalid arguments: ${String(e)}`),
      })

      const { stdout, stderr, exitCode } = yield* Effect.tryPromise({
        try: async () => {
          const proc = Bun.spawn(["sh", "-c", command], {
            cwd: workspaceRoot,
            stdout: "pipe",
            stderr: "pipe",
          })
          const [out, err] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
          ])
          const code = await proc.exited
          return { stdout: out, stderr: err, exitCode: code }
        },
        catch: (e) => new Error(`shell failed to spawn: ${String(e)}`),
      })

      const combined = [stdout, stderr].filter(Boolean).join("\n").trim()
      const output = combined || "(no output)"
      return `exit ${exitCode}\n${truncate(output)}`
    }).pipe(
      Effect.catchCause((cause) => Effect.succeed(`shell error: ${Cause.pretty(cause)}`)),
    ),
})
