import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type HookInput = {
  readonly cwd?: string;
  readonly tool_input?: {
    readonly command?: string;
  };
  readonly tool_response?: unknown;
};

const CHECK_COMMANDS = [
  /\bbun\s+run\s+(lint|typecheck|test|effect:diagnostics|effect:ls:check)\b/,
  /\bbunx\s+biome\s+check\b/,
  /\bbunx\s+tsc\b/,
  /\bbunx\s+effect-language-service\s+(diagnostics|check)\b/,
  /\beffect-language-service\s+(diagnostics|check)\b/,
  /\btsc\b.*\s--noEmit\b/,
];

async function readInput(): Promise<HookInput> {
  const text = await Bun.stdin.text();
  if (text.trim() === "") {
    return {};
  }
  return JSON.parse(text) as HookInput;
}

function looksLikeCheck(command: string): boolean {
  return CHECK_COMMANDS.some((pattern) => pattern.test(command));
}

function responseSucceeded(response: unknown): boolean {
  if (response && typeof response === "object") {
    const record = response as Record<string, unknown>;
    for (const key of ["exit_code", "exitCode", "exit_status", "status_code"]) {
      if (record[key] === 0) {
        return true;
      }
    }
    if (record.status === "success" || record.result === "success") {
      return true;
    }
    if (record.success === true) {
      return true;
    }
  }
  return false;
}

function gitRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return cwd;
  }
  return result.stdout.trim();
}

function statePath(cwd: string): string {
  const key = cwd.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  return join("/tmp", "theseus-codex-hooks", key, "last-check.json");
}

async function main(): Promise<void> {
  const input = await readInput();
  const command = input.tool_input?.command ?? "";
  if (!looksLikeCheck(command)) {
    return;
  }

  const cwd = gitRoot(input.cwd ?? process.cwd());
  const markerPath = statePath(cwd);
  const marker = {
    command,
    checkedAt: new Date().toISOString(),
    success: responseSucceeded(input.tool_response),
  };

  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
}

main();
