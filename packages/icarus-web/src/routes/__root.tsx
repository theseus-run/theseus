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
  const label = state === "connected" ? "ok" : state === "connecting" ? ".." : "xx";
  const color =
    state === "connected"
      ? "text-green-500"
      : state === "connecting"
        ? "text-yellow-500"
        : "text-red-500";

  return <span className={color}>[{label}]</span>;
}

export function RootLayout() {
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="text-foreground uppercase tracking-wider hover:text-muted-foreground transition-colors font-semibold"
          >
            theseus
          </Link>
          <ConnectionStatus />
          <Link
            to="/poc-tree"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            tree poc
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
