import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile as readDiskFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Tool from "@theseus.run/core/Tool";
import { Effect } from "effect";
import { allTools, listDir, readFile, readonlyTools, searchReplace, writeFile } from "./index.ts";
import { allToolMeta, TOOL_META } from "./metadata.ts";

const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "theseus-tools-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const callText = async (tool: Tool.ToolAny, raw: unknown) => {
  const effect = Tool.callTool(tool, raw) as Effect.Effect<
    Tool.ToolOutcome<unknown, unknown, unknown>,
    Tool.ToolRuntimeError,
    never
  >;
  const result = await Effect.runPromise(effect);
  return result.presentation.content
    .map((content) => (content._tag === "text" ? content.text : ""))
    .join("");
};

describe("@theseus.run/tools metadata", () => {
  test("publishes metadata for every runtime tool", () => {
    expect(allToolMeta.map((meta) => meta.name).sort()).toEqual(
      allTools.map((tool) => tool.name).sort(),
    );

    for (const tool of allTools) {
      expect(TOOL_META[tool.name]?.interaction).toBe(tool.policy.interaction);
    }
  });

  test("readonlyTools contains only observe tools", () => {
    expect(readonlyTools.map((tool) => tool.policy.interaction)).toEqual(
      readonlyTools.map(() => "observe"),
    );
  });
});

describe("@theseus.run/tools filesystem tools", () => {
  test("write_file creates parents and read_file returns line-numbered content", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "nested", "sample.txt");

    await callText(writeFile, { path, content: "one\ntwo" });
    expect(await readDiskFile(path, "utf8")).toBe("one\ntwo");

    const output = await callText(readFile, { path });
    expect(output).toContain("1\tone");
    expect(output).toContain("2\ttwo");
  });

  test("search_replace updates a unique match", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "sample.txt");
    await callText(writeFile, { path, content: "alpha\nbeta\ngamma" });

    const output = await callText(searchReplace, { path, old: "beta", new: "delta" });
    expect(output).toContain("Replaced 1 occurrence");
    expect(await readDiskFile(path, "utf8")).toBe("alpha\ndelta\ngamma");
  });

  test("list_dir filters common noise entries", async () => {
    const dir = await makeTempDir();
    await callText(writeFile, { path: join(dir, "src", "index.ts"), content: "export {};" });
    await callText(writeFile, { path: join(dir, "node_modules", "pkg.js"), content: "" });

    const output = await callText(listDir, { path: dir });
    expect(output).toContain("src/");
    expect(output).not.toContain("node_modules");
  });
});
