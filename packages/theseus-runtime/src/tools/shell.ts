/**
 * shell — Execute a shell command.
 *
 * Uses Bun.$ (Zig-backed shell). Injection-safe by default.
 * Timeout via Effect.timeout, output cap, exit code reporting.
 * Timeouts are retriable (auto-retried 3x by callTool).
 */

import { $ } from "bun";
import { Duration, Effect } from "effect";
import { defineTool, fromZod } from "@theseus.run/core";
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 8192;

const inputSchema = z.object({
  command: z.string().min(1),
  timeout_ms: z.number().int().min(1000).max(600_000).optional(),
});

type Input = z.infer<typeof inputSchema>;

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

export const shell = defineTool<Input, string>({
  name: "shell",
  description:
    "Execute a shell command. Returns stdout, stderr, and exit code. Timeout defaults to 30 seconds. Output capped at 8KB.",
  inputSchema: fromZod(inputSchema),
  safety: "destructive",
  capabilities: ["shell.exec"],
  execute: ({ command, timeout_ms }, { fail, retriable }) => {
    const timeout = timeout_ms ?? DEFAULT_TIMEOUT_MS;

    const run = Effect.tryPromise({
      try: () => $`bash -c ${command}`.nothrow().quiet(),
      catch: (e) => fail(`Shell failed: ${e}`),
    });

    return run.pipe(
      // Effect.timeout adds TimeoutError to error channel — catch and convert
      Effect.timeout(Duration.millis(timeout)),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(retriable(`Command timed out after ${timeout}ms: ${command}`)),
      Effect.flatMap((result) => {
        const stdout = truncateOutput(result.stdout.toString(), MAX_OUTPUT_BYTES);
        const stderr = result.stderr.toString().trim();
        const exitCode = result.exitCode;

        const parts: string[] = [];
        if (stdout) parts.push(stdout);
        if (stderr)
          parts.push(
            `[stderr]\n${truncateOutput(stderr, MAX_OUTPUT_BYTES / 2)}`,
          );
        parts.push(`[exit code: ${exitCode}]`);

        return Effect.succeed(parts.join("\n"));
      }),
    );
  },
  encode: (s) => s,
});
