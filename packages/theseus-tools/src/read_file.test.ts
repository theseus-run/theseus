import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { readFile } from "./read_file.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "theseus-read-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("read_file", () => {
  test("reads a file with line numbers", async () => {
    const path = join(dir, "hello.ts");
    await writeFile(path, "const a = 1;\nconst b = 2;\nconst c = 3;\n");

    const result = await Effect.runPromise(Tool.call(readFile, { path }));
    expect(result.llmContent).toContain("1\tconst a = 1;");
    expect(result.llmContent).toContain("2\tconst b = 2;");
    expect(result.llmContent).toContain("3\tconst c = 3;");
  });

  test("errors on file not found", async () => {
    const path = join(dir, "nonexistent.ts");
    const err = await Effect.runPromise(
      Tool.call(readFile, { path }).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
  });

  test("returns binary indicator for non-text files", async () => {
    const path = join(dir, "image.png");
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    await writeFile(path, png);

    const result = await Effect.runPromise(Tool.call(readFile, { path }));
    expect(result.llmContent).toContain("Binary file");
  });

  test("supports offset and limit", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join("\n");
    const path = join(dir, "big.txt");
    await writeFile(path, lines);

    const result = await Effect.runPromise(
      Tool.call(readFile, { path, offset: 10, limit: 5 }),
    );
    expect(result.llmContent).toContain("line 10");
    expect(result.llmContent).toContain("line 14");
    expect(result.llmContent).not.toContain("line 15");
  });

  test("truncates long lines", async () => {
    const longLine = "x".repeat(3000);
    const path = join(dir, "long.txt");
    await writeFile(path, longLine);

    const result = await Effect.runPromise(Tool.call(readFile, { path }));
    expect(result.llmContent).toContain("...");
    expect(result.llmContent.length).toBeLessThan(3000);
  });

  test("shows truncation indicator for large files", async () => {
    const lines = Array.from({ length: 2500 }, (_, i) => `line ${i + 1}`).join("\n");
    const path = join(dir, "huge.txt");
    await writeFile(path, lines);

    const result = await Effect.runPromise(Tool.call(readFile, { path }));
    expect(result.llmContent).toContain("truncated");
    expect(result.llmContent).toContain("of 2500 lines");
  });
});
