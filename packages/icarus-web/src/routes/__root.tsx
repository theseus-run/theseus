/**
 * Root layout shell.
 */

import { Link, Outlet } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { connection } from "@/lib/queries";
import type { ConnectionState } from "@/lib/rpc-client";

function useConnectionState(): ConnectionState {
  return useSyncExternalStore(connection.subscribe, connection.getState);
}

function ConnectionStatus() {
  const state = useConnectionState();
  const tone =
    state === "connected" ? "tone-good" : state === "connecting" ? "tone-process" : "tone-danger";
  const label =
    state === "connected"
      ? "connected"
      : state === "connecting"
        ? "connecting"
        : "server offline / reconnecting";

  return (
    <span className="status-mark">
      <span className={`status-mark-symbol ${tone}`} aria-hidden="true">
        ◆
      </span>
      <span>{label}</span>
    </span>
  );
}

export function RootLayout() {
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between gap-4 px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-foreground uppercase tracking-wider font-semibold">icarus</span>
          <ConnectionStatus />
        </div>
        <nav className="flex items-center gap-3 text-muted-foreground">
          <Link to="/">workbench</Link>
          <Link to="/primitives">primitives</Link>
        </nav>
      </header>

      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
