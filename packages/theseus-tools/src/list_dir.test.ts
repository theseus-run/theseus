import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import { callTool } from "@theseus.run/core";
import { listDir } from "./list_dir.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "theseus-listdir-"));
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "docs"));
  await mkdir(join(dir, "node_modules"));
  await mkdir(join(dir, ".git"));
  await writeFile(join(dir, "index.ts"), "export {};");
  await writeFile(join(dir, "README.md"), "# Hello");
  await writeFile(join(dir, ".DS_Store"), "");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("list_dir", () => {
  test("lists files and directories", async () => {
    const result = await Effect.runPromise(callTool(listDir, { path: dir }));
    expect(result.llmContent).toContain("src/");
    expect(result.llmContent).toContain("docs/");
    expect(result.llmContent).toContain("index.ts");
    expect(result.llmContent).toContain("README.md");
  });

  test("filters noise directories", async () => {
    const result = await Effect.runPromise(callTool(listDir, { path: dir }));
    expect(result.llmContent).not.toContain("node_modules");
    expect(result.llmContent).not.toContain(".git");
    expect(result.llmContent).not.toContain(".DS_Store");
  });

  test("sorts directories first, then files", async () => {
    const result = await Effect.runPromise(callTool(listDir, { path: dir }));
    const lines = result.llmContent.split("\n");
    const firstDir = lines.findIndex((l) => l.endsWith("/"));
    const firstFile = lines.findIndex((l) => !l.endsWith("/") && !l.endsWith("@"));
    expect(firstDir).toBeLessThan(firstFile);
  });

  test("indicates directories with /", async () => {
    const result = await Effect.runPromise(callTool(listDir, { path: dir }));
    expect(result.llmContent).toContain("src/");
    expect(result.llmContent).toContain("docs/");
  });

  test("errors on non-existent path", async () => {
    const err = await Effect.runPromise(
      callTool(listDir, { path: join(dir, "nope") }).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
  });
});
