import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import { callTool } from "@theseus.run/core";
import { writeFile as writeFileTool } from "./write_file.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "theseus-write-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("write_file", () => {
  test("creates a new file", async () => {
    const path = join(dir, "new.ts");
    const content = 'export const hello = "world";\n';

    const result = await Effect.runPromise(
      callTool(writeFileTool, { path, content }),
    );
    expect(result.llmContent).toContain("Wrote");
    expect(result.llmContent).toContain("lines");

    const written = await readFile(path, "utf-8");
    expect(written).toBe(content);
  });

  test("overwrites existing file", async () => {
    const path = join(dir, "overwrite.ts");
    await Bun.write(path, "old content");

    const newContent = "new content\n";
    await Effect.runPromise(
      callTool(writeFileTool, { path, content: newContent }),
    );

    const written = await readFile(path, "utf-8");
    expect(written).toBe(newContent);
  });

  test("creates parent directories", async () => {
    const path = join(dir, "deep/nested/dir/file.ts");
    const content = "deep file\n";

    const result = await Effect.runPromise(
      callTool(writeFileTool, { path, content }),
    );
    expect(result.llmContent).toContain("Wrote");

    const written = await readFile(path, "utf-8");
    expect(written).toBe(content);
  });

  test("reports line count correctly", async () => {
    const path = join(dir, "count.ts");
    const content = "line 1\nline 2\nline 3\n";

    const result = await Effect.runPromise(
      callTool(writeFileTool, { path, content }),
    );
    expect(result.llmContent).toContain("4 lines");
  });
});
