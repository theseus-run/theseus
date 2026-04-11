import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { shell } from "./shell.ts";

describe("shell", () => {
  test("executes basic command", async () => {
    const result = await Effect.runPromise(Tool.call(shell, { command: "echo hello" }));
    expect(result.llmContent).toContain("hello");
    expect(result.llmContent).toContain("[exit code: 0]");
  });

  test("reports non-zero exit code", async () => {
    const result = await Effect.runPromise(
      Tool.call(shell, { command: "exit 42" }),
    );
    expect(result.llmContent).toContain("[exit code: 42]");
  });

  test("captures stderr", async () => {
    const result = await Effect.runPromise(
      Tool.call(shell, { command: "echo error >&2" }),
    );
    expect(result.llmContent).toContain("[stderr]");
    expect(result.llmContent).toContain("error");
  });

  test("truncates large output", async () => {
    const result = await Effect.runPromise(
      Tool.call(shell, { command: "seq 1 10000" }),
    );
    expect(result.llmContent).toContain("truncated");
  });

  test("timeout produces error", async () => {
    const err = await Effect.runPromise(
      Tool.call(shell, { command: "sleep 10", timeout_ms: 1000 }).pipe(Effect.flip),
    );
    // After 3 retries of retriable timeout, should fail
    expect(err._tag).toBeDefined();
  }, 30_000);

  test("handles command with pipes", async () => {
    const result = await Effect.runPromise(
      Tool.call(shell, { command: "echo 'a b c' | tr ' ' '\\n' | wc -l" }),
    );
    expect(result.llmContent).toContain("3");
  });
});
