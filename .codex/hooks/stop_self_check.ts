import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

type HookInput = {
  readonly cwd?: string;
  readonly stop_hook_active?: boolean;
};

type CheckMarker = {
  readonly command?: string;
  readonly checkedAt?: string;
  readonly success?: boolean;
};

const RELEVANT_FILE = /\.(ts|tsx|js|jsx|json|grit|md)$/;
const RELEVANT_PREFIXES = [
  "packages/",
  "plugins/",
  ".agents/skills/",
  ".codex/",
  "AGENTS.md",
  "biome.json",
  "package.json",
  "tsconfig.json",
];

async function readInput(): Promise<HookInput> {
  const text = await Bun.stdin.text();
  if (text.trim() === "") {
    return {};
  }
  return JSON.parse(text) as HookInput;
}

function git(cwd: string, args: ReadonlyArray<string>): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function changedFiles(cwd: string): ReadonlyArray<string> {
  return git(cwd, ["status", "--porcelain"])
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((file) => {
      if (file.startsWith(".codex/state/")) {
        return false;
      }
      return (
        RELEVANT_FILE.test(file) || RELEVANT_PREFIXES.some((prefix) => file.startsWith(prefix))
      );
    });
}

function latestModifiedAt(cwd: string, files: ReadonlyArray<string>): number {
  let latest = 0;
  for (const file of files) {
    const path = join(cwd, file);
    if (!existsSync(path)) {
      continue;
    }
    latest = Math.max(latest, statSync(path).mtimeMs);
  }
  return latest;
}

function readMarker(cwd: string): CheckMarker | undefined {
  const markerPath = statePath(cwd, "last-check.json");
  if (!existsSync(markerPath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(markerPath, "utf8")) as CheckMarker;
}

function statePath(cwd: string, name: string): string {
  const key = cwd.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  return join("/tmp", "theseus-codex-hooks", key, name);
}

function writeHookState(cwd: string, state: unknown): void {
  const path = statePath(cwd, "last-stop-self-check.json");
  mkdirSync(dirname(path), { recursive: true });
  Bun.write(path, `${JSON.stringify(state, null, 2)}\n`);
}

const input = await readInput();
if (input.stop_hook_active) {
  process.exit(0);
}

const cwd =
  git(input.cwd ?? process.cwd(), ["rev-parse", "--show-toplevel"]) || input.cwd || process.cwd();
const files = changedFiles(cwd);
if (files.length === 0) {
  process.exit(0);
}

const latestChange = latestModifiedAt(cwd, files);
const marker = readMarker(cwd);
const checkedAt = marker?.checkedAt ? Date.parse(marker.checkedAt) : 0;

if (marker?.success === true && Number.isFinite(checkedAt) && checkedAt >= latestChange) {
  process.exit(0);
}

writeHookState(cwd, {
  blockedAt: new Date().toISOString(),
  files,
  lastCheck: marker,
});

const shownFiles = files
  .slice(0, 8)
  .map((file) => `- ${file}`)
  .join("\n");
const more = files.length > 8 ? `\n- ...and ${files.length - 8} more` : "";

await Bun.write(
  Bun.stdout,
  JSON.stringify({
    decision: "block",
    reason: [
      marker?.success === false && Number.isFinite(checkedAt) && checkedAt >= latestChange
        ? "The latest deterministic check failed after code-relevant edits."
        : "Code-relevant files changed without a successful deterministic check after the latest edit.",
      "Load skill: agent-self-check.",
      "Run the narrowest relevant check now, for example `bun run lint`, `bun run typecheck`, `bun run test`, or `bun run effect:diagnostics`, then fix any diagnostics before finalizing.",
      "",
      "Changed files:",
      shownFiles + more,
    ].join("\n"),
  }),
);
