/**
 * Daemon lifecycle — pidfile management, socket path, health check.
 *
 * Convention:
 *   {workspace}/.theseus/daemon.pid    — contains PID as text
 *   {workspace}/.theseus/daemon.sock   — unix domain socket
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Paths — deterministic from workspace root
// ---------------------------------------------------------------------------

const theseusDir = (workspace: string): string => join(workspace, ".theseus");

export const socketPath = (workspace: string): string =>
  join(theseusDir(workspace), "daemon.sock");

export const pidfilePath = (workspace: string): string =>
  join(theseusDir(workspace), "daemon.pid");

// ---------------------------------------------------------------------------
// Pidfile — write / read / remove
// ---------------------------------------------------------------------------

export const writePidfile = (workspace: string, pid?: number): void => {
  const dir = theseusDir(workspace);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(pidfilePath(workspace), String(pid ?? process.pid), "utf-8");
};

export const readPidfile = (workspace: string): number | null => {
  try {
    const content = readFileSync(pidfilePath(workspace), "utf-8").trim();
    const pid = Number.parseInt(content, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
};

export const removePidfile = (workspace: string): void => {
  try { unlinkSync(pidfilePath(workspace)); } catch { /* ignore */ }
};

export const removeSocket = (workspace: string): void => {
  try { unlinkSync(socketPath(workspace)); } catch { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Process check — is a PID alive?
// ---------------------------------------------------------------------------

export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// isDaemonRunning — checks pidfile + socket + process liveness
// ---------------------------------------------------------------------------

export const isDaemonRunning = (workspace: string): { running: boolean; pid: number | null } => {
  const pid = readPidfile(workspace);
  if (pid === null) return { running: false, pid: null };

  if (!isProcessAlive(pid)) {
    // Stale pidfile — clean up
    removePidfile(workspace);
    removeSocket(workspace);
    return { running: false, pid: null };
  }

  // Process is alive and socket exists
  const sockExists = existsSync(socketPath(workspace));
  return { running: sockExists, pid };
};

// ---------------------------------------------------------------------------
// Cleanup — remove pidfile + socket (called on graceful shutdown)
// ---------------------------------------------------------------------------

export const cleanupDaemonFiles = (workspace: string): void => {
  removePidfile(workspace);
  removeSocket(workspace);
};
