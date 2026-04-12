/**
 * icarus-web server — Bun HTTP + WebSocket server that bridges
 * browser clients to the theseus daemon over unix socket.
 *
 * Usage: bun run server/index.ts [workspace]
 *
 * - Serves static dist/ files (build with `bun run build` first)
 * - /ws upgrades to WebSocket, bridging JSON messages to daemon unix socket
 */

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { encodeFrame, FrameDecoder } from "@theseus.run/runtime/daemon/codec";
import type { BridgeRequest } from "@theseus.run/core/Daemon";
import type { ServerWebSocket } from "bun";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const workspace = process.argv[2] || process.cwd();
const port = Number(process.env.ICARUS_WEB_PORT) || 4800;
const daemonSocketPath = join(workspace, ".theseus", "daemon.sock");

// ---------------------------------------------------------------------------
// Daemon connection — one unix socket per browser WS connection
// ---------------------------------------------------------------------------

interface DaemonConn {
  socket: Socket;
  decoder: FrameDecoder;
}

const connections = new Map<ServerWebSocket, DaemonConn>();

async function connectToDaemon(ws: ServerWebSocket): Promise<DaemonConn> {
  const decoder = new FrameDecoder();
  const socket = createConnection({ path: daemonSocketPath });
  const conn: DaemonConn = { socket, decoder };

  socket.on("data", (data: Buffer) => {
    const messages = decoder.push(data);
    for (const msg of messages) {
      try { ws.send(JSON.stringify(msg)); } catch { /* ws closed */ }
    }
  });

  socket.on("error", (err) => {
    try {
      ws.send(JSON.stringify({
        _tag: "Error", id: "",
        error: { code: "CONNECTION_LOST", message: `Daemon: ${err.message}` },
      }));
    } catch { /* ws closed */ }
  });

  socket.on("close", () => {
    connections.delete(ws);
    try {
      ws.send(JSON.stringify({
        _tag: "Error", id: "",
        error: { code: "CONNECTION_LOST", message: "Daemon connection closed" },
      }));
    } catch { /* ws closed */ }
  });

  await new Promise<void>((res, rej) => {
    socket.once("connect", res);
    socket.once("error", rej);
  });

  connections.set(ws, conn);
  return conn;
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

const distDir = resolve(import.meta.dir, "../dist");
const hasDistDir = existsSync(distDir);

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const getMime = (path: string) =>
  mimeTypes[path.slice(path.lastIndexOf("."))] ?? "application/octet-stream";

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

console.log(`[icarus-web] workspace: ${workspace}`);
console.log(`[icarus-web] daemon socket: ${daemonSocketPath}`);
console.log(`[icarus-web] http://localhost:${port}`);

if (!existsSync(daemonSocketPath)) {
  console.warn(`[icarus-web] warning: daemon socket not found — start daemon first`);
}

Bun.serve({
  port,

  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (hasDistDir) {
      let filePath = join(distDir, url.pathname === "/" ? "index.html" : url.pathname);
      let file = Bun.file(filePath);

      if (!(await file.exists())) {
        filePath = join(distDir, "index.html");
        file = Bun.file(filePath);
      }

      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": getMime(filePath) },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    async open(ws: ServerWebSocket) {
      try {
        await connectToDaemon(ws);
      } catch (err) {
        ws.send(JSON.stringify({
          _tag: "Error", id: "",
          error: { code: "CONNECTION_LOST", message: `Failed to connect: ${err}` },
        }));
        ws.close();
      }
    },

    message(ws: ServerWebSocket, message: string | Buffer) {
      const conn = connections.get(ws);
      if (!conn) return;
      try {
        const msg = JSON.parse(String(message)) as BridgeRequest;
        if (!conn.socket.destroyed) {
          conn.socket.write(encodeFrame(msg));
        }
      } catch {
        ws.send(JSON.stringify({
          _tag: "Error", id: "",
          error: { code: "INVALID_REQUEST", message: "Invalid JSON" },
        }));
      }
    },

    close(ws: ServerWebSocket) {
      const conn = connections.get(ws);
      if (conn) {
        conn.socket.destroy();
        connections.delete(ws);
      }
    },
  },
});
