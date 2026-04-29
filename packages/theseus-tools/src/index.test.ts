import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile as readDiskFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Tool from "@theseus.run/core/Tool";
import { Effect, Layer } from "effect";
import {
  allTools,
  grep,
  listDir,
  readFile,
  readonlyTools,
  searchReplace,
  shell,
  ToolPlatform,
  ToolPlatformBunLive,
  writeFile,
} from "./index.ts";
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
  const result = await Effect.runPromise(effect.pipe(Effect.provide(ToolPlatformBunLive)));
  return result.presentation.content
    .map((content) => (content._tag === "text" ? content.text : ""))
    .join("");
};

const callError = async (tool: Tool.ToolAny, raw: unknown) => {
  const effect = Tool.callTool(tool, raw) as Effect.Effect<
    Tool.ToolOutcome<unknown, unknown, unknown>,
    Tool.ToolRuntimeError,
    never
  >;
  return await Effect.runPromise(Effect.flip(effect.pipe(Effect.provide(ToolPlatformBunLive))));
};

describe("@theseus.run/tools metadata", () => {
  test("publishes metadata for every runtime tool", () => {
    expect(allToolMeta.map((meta) => meta.name).sort()).toEqual(
      allTools.map((tool) => tool.name).sort(),
    );

    for (const tool of allTools) {
      expect(TOOL_META[tool.name]?.interaction).toBe(tool.policy.interaction);
      expect(TOOL_META[tool.name]?.description).toBe(tool.description);
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

  test("read_file rejects non-positive offset and limit at schema boundary", async () => {
    const offsetError = await callError(readFile, { path: "x", offset: 0 });
    const limitError = await callError(readFile, { path: "x", limit: 0 });

    expect(offsetError._tag).toBe("ToolInputError");
    expect(limitError._tag).toBe("ToolInputError");
  });

  test("read_file can run against a fake tool platform", async () => {
    const FakePlatform = Layer.succeed(ToolPlatform)({
      exists: (path) => Effect.succeed(path === "virtual.txt"),
      readFileString: () => Effect.succeed("alpha\nbeta"),
    });

    const effect = Tool.callTool(readFile, { path: "virtual.txt" }) as Effect.Effect<
      Tool.ToolOutcome<unknown, unknown, unknown>,
      Tool.ToolRuntimeError,
      typeof ToolPlatform
    >;
    const result = await Effect.runPromise(effect.pipe(Effect.provide(FakePlatform)));

    expect(
      result.presentation.content.map((content) => (content._tag === "text" ? content.text : "")),
    ).toContain("1\talpha\n2\tbeta");
  });

  test("grep rejects out-of-range context_lines at schema boundary", async () => {
    const low = await callError(grep, { pattern: "x", context_lines: -1 });
    const high = await callError(grep, { pattern: "x", context_lines: 11 });

    expect(low._tag).toBe("ToolInputError");
    expect(high._tag).toBe("ToolInputError");
  });

  test("shell rejects out-of-range timeout at schema boundary", async () => {
    const low = await callError(shell, { command: "echo ok", timeout_ms: 999 });
    const high = await callError(shell, { command: "echo ok", timeout_ms: 600_001 });

    expect(low._tag).toBe("ToolInputError");
    expect(high._tag).toBe("ToolInputError");
  });
});
