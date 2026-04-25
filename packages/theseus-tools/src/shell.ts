/**
 * shell — Execute a shell command.
 *
 * Uses Bun.$ (Zig-backed shell). Injection-safe by default.
 * Timeout via Effect.timeout, output cap, exit code reporting.
 */

import * as Tool from "@theseus.run/core/Tool";
import { $ } from "bun";
import { Duration, Effect, Schedule, Schema } from "effect";
import { ToolFailure } from "./failure.ts";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 8192;

const Input = Schema.Struct({
  command: Schema.String,
  timeout_ms: Schema.optional(
    Schema.Int.annotate({ description: "Timeout (default 30000, max 600000)" }),
  ),
});

type Input = Schema.Schema.Type<typeof Input>;

const truncateOutput = (output: string, maxBytes: number): string => {
  if (Buffer.byteLength(output) <= maxBytes) return output;

  const halfBytes = Math.floor(maxBytes / 2) - 50;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(output);

  const head = new TextDecoder().decode(bytes.slice(0, halfBytes));
  const tail = new TextDecoder().decode(bytes.slice(bytes.length - halfBytes));
  const elided = bytes.length - halfBytes * 2;

  return `${head}\n\n[... ${elided} bytes truncated ...]\n\n${tail}`;
};

export const shell = Tool.defineTool<Input, string, ToolFailure>({
  name: "shell",
  description:
    "Run a shell command. Returns stdout, stderr, exit code. Default timeout 30s (max 600s). Output capped at 8KB.",
  input: Input as unknown as Schema.Schema<Input>,
  failure: ToolFailure as unknown as Schema.Schema<ToolFailure>,
  policy: { interaction: "write_destructive" },
  // Retry transient failures (e.g. timeouts, EBUSY) up to 3 times.
  retry: Schedule.recurs(3) as unknown as Schedule.Schedule<unknown>,
  execute: ({ command, timeout_ms }) => {
    const timeout = timeout_ms ?? DEFAULT_TIMEOUT_MS;

    const run = Effect.tryPromise({
      try: () => $`bash -c ${command}`.nothrow().quiet(),
      catch: (e) => new ToolFailure({ message: `Shell failed: ${e}` }),
    });

    return run.pipe(
      Effect.timeout(Duration.millis(timeout)),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new ToolFailure({ message: `Command timed out after ${timeout}ms: ${command}` }),
        ),
      ),
      Effect.flatMap((result) => {
        const stdout = truncateOutput(result.stdout.toString(), MAX_OUTPUT_BYTES);
        const stderr = result.stderr.toString().trim();
        const exitCode = result.exitCode;

        const parts: string[] = [];
        if (stdout) parts.push(stdout);
        if (stderr) parts.push(`[stderr]\n${truncateOutput(stderr, MAX_OUTPUT_BYTES / 2)}`);
        parts.push(`[exit code: ${exitCode}]`);

        return Effect.succeed(parts.join("\n"));
      }),
    );
  },
});
