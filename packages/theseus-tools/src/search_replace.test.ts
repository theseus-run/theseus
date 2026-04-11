import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import * as Tool from "@theseus.run/core/Tool";
import { searchReplace } from "./search_replace.ts";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "theseus-sr-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("search_replace", () => {
  test("exact replacement", async () => {
    const path = join(dir, "exact.ts");
    await writeFile(path, 'const name = "old";\n');

    const result = await Effect.runPromise(
      Tool.call(searchReplace, { path, old: '"old"', new: '"new"' }),
    );
    expect(result.llmContent).toContain("exact");
    expect(result.llmContent).toContain("Replaced 1 occurrence");

    const content = await readFile(path, "utf-8");
    expect(content).toContain('"new"');
    expect(content).not.toContain('"old"');
  });

  test("whitespace-normalized fallback", async () => {
    const path = join(dir, "fuzzy.ts");
    await writeFile(path, "function  hello( x:  number ) {\n  return x;\n}\n");

    const result = await Effect.runPromise(
      Tool.call(searchReplace, {
        path,
        old: "function hello( x: number ) {",
        new: "function hello( x: string ) {",
      }),
    );
    expect(result.llmContent).toContain("whitespace-normalized");

    const content = await readFile(path, "utf-8");
    expect(content).toContain("string");
  });

  test("errors on multiple matches", async () => {
    const path = join(dir, "multi.ts");
    await writeFile(path, "const a = 1;\nconst b = 1;\nconst a = 1;\n");

    const err = await Effect.runPromise(
      Tool.call(searchReplace, { path, old: "const a = 1;", new: "const a = 2;" }).pipe(
        Effect.flip,
      ),
    );
    expect(err._tag).toBe("ToolError");
  });

  test("errors on text not found", async () => {
    const path = join(dir, "notfound.ts");
    await writeFile(path, "const x = 1;\n");

    const err = await Effect.runPromise(
      Tool.call(searchReplace, { path, old: "const y = 2;", new: "const y = 3;" }).pipe(
        Effect.flip,
      ),
    );
    expect(err._tag).toBe("ToolError");
  });

  test("errors on file not found", async () => {
    const err = await Effect.runPromise(
      Tool.call(searchReplace, {
        path: join(dir, "nope.ts"),
        old: "a",
        new: "b",
      }).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
  });

  test("returns context around edit", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const path = join(dir, "context.ts");
    await writeFile(path, lines);

    const result = await Effect.runPromise(
      Tool.call(searchReplace, { path, old: "line 10", new: "REPLACED" }),
    );
    expect(result.llmContent).toContain("REPLACED");
    expect(result.llmContent).toContain("line 9");
    expect(result.llmContent).toContain("line 11");
  });
});
