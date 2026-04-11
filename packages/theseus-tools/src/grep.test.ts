import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { grep } from "./grep.ts";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

let dir: string;
let hasRg = false;

beforeAll(async () => {
  // Check if rg is on PATH (not just a shell alias)
  try {
    execSync("rg --version", { stdio: "pipe" });
    hasRg = true;
  } catch {
    hasRg = false;
  }

  dir = await mkdtemp(join(tmpdir(), "theseus-grep-"));
  await mkdir(join(dir, "src"));
  await writeFile(
    join(dir, "src/foo.ts"),
    'const hello = "world";\nfunction greet() { return hello; }\n',
  );
  await writeFile(
    join(dir, "src/bar.ts"),
    'import { hello } from "./foo";\nconsole.log(hello);\n',
  );
  await writeFile(join(dir, "README.md"), "# Hello World\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("grep", () => {
  test("finds matches across files", async () => {
    if (!hasRg) return; // ripgrep not on PATH
    const result = await Effect.runPromise(
      Tool.call(grep, { pattern: "hello", path: dir }),
    );
    expect(result.llmContent).toContain("foo.ts");
    expect(result.llmContent).toContain("bar.ts");
  });

  test("returns 'No matches found' for no results", async () => {
    if (!hasRg) return;
    const result = await Effect.runPromise(
      Tool.call(grep, { pattern: "nonexistent_string_xyz", path: dir }),
    );
    expect(result.llmContent).toContain("No matches found");
  });

  test("supports glob filtering", async () => {
    if (!hasRg) return;
    const result = await Effect.runPromise(
      Tool.call(grep, { pattern: "Hello", path: dir, glob: "*.md" }),
    );
    expect(result.llmContent).not.toContain(".ts");
  });

  test("supports regex patterns", async () => {
    if (!hasRg) return;
    const result = await Effect.runPromise(
      Tool.call(grep, { pattern: "function\\s+\\w+", path: dir }),
    );
    expect(result.llmContent).toContain("greet");
  });

  test("groups results by file", async () => {
    if (!hasRg) return;
    const result = await Effect.runPromise(
      Tool.call(grep, { pattern: "hello", path: dir }),
    );
    const lines = result.llmContent.split("\n");
    const fileHeaders = lines.filter((l) => l && !l.startsWith(" "));
    expect(fileHeaders.length).toBeGreaterThan(0);
  });
});
