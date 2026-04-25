import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DISPATCH_DIR = join(import.meta.dir, ".");

const FORBIDDEN_UPWARD_IMPORTS = [
  "../agent",
  "../Agent",
  "../agent-comm",
  "../AgentComm",
  "../grunt",
  "../Grunt",
  "../capsule",
  "../Capsule",
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sourceFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat();
};

describe("dispatch topology", () => {
  test("dispatch primitive does not import higher-level domains", async () => {
    const files = await sourceFiles(DISPATCH_DIR);
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const specifier of FORBIDDEN_UPWARD_IMPORTS) {
        const pattern = new RegExp(`from\\s+["']${escapeRegExp(specifier)}(?=["'/])`);
        if (pattern.test(source)) violations.push(`${file}: ${specifier}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
