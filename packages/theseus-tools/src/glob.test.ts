import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import { callTool } from "@theseus.run/core";
import { glob } from "./glob.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "theseus-glob-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "src/utils"), { recursive: true });
  await mkdir(join(dir, "node_modules/dep"), { recursive: true });
  await writeFile(join(dir, "src/index.ts"), "");
  await writeFile(join(dir, "src/utils/helper.ts"), "");
  await writeFile(join(dir, "src/app.tsx"), "");
  await writeFile(join(dir, "README.md"), "");
  await writeFile(join(dir, "node_modules/dep/index.js"), "");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("glob", () => {
  test("matches pattern", async () => {
    const result = await Effect.runPromise(
      callTool(glob, { pattern: "**/*.ts", path: dir }),
    );
    expect(result.llmContent).toContain("src/index.ts");
    expect(result.llmContent).toContain("src/utils/helper.ts");
  });

  test("filters noise directories", async () => {
    const result = await Effect.runPromise(
      callTool(glob, { pattern: "**/*.js", path: dir }),
    );
    expect(result.llmContent).not.toContain("node_modules");
  });

  test("returns 'No files found' for no matches", async () => {
    const result = await Effect.runPromise(
      callTool(glob, { pattern: "**/*.py", path: dir }),
    );
    expect(result.llmContent).toContain("No files found");
  });

  test("caps results at 100", async () => {
    const subdir = join(dir, "many");
    await mkdir(subdir, { recursive: true });
    for (let i = 0; i < 110; i++) {
      await writeFile(join(subdir, `file${i}.txt`), "");
    }

    const result = await Effect.runPromise(
      callTool(glob, { pattern: "many/*.txt", path: dir }),
    );
    expect(result.llmContent).toContain("capped at 100");
  });
});
