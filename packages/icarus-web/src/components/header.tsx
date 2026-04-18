/**
 * Header — top bar with connection status, agent info, and controls.
 */

import { cn } from "@/lib/utils";

interface HeaderProps {
  connected: boolean;
  running: boolean;
  agent: string;
  iteration: number;
  onReset: () => void;
  onBack?: (() => void) | undefined;
}

export function Header({ connected, running, agent, iteration, onReset, onBack }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 px-4 h-9 bg-zinc-950 shrink-0">
      <div className="flex items-center gap-2 text-xs">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-zinc-600 hover:text-zinc-300 transition-colors mr-1"
          >
            &larr;
          </button>
        )}
        <span className="text-zinc-300 font-semibold">icarus</span>
        <span className="text-zinc-600">|</span>
        {running ? (
          <span className="text-cyan-500">
            {agent || "..."} <span className="text-zinc-500">iter {iteration}</span>
          </span>
        ) : (
          <span className="text-zinc-500">idle</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div
            className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-red-500")}
          />
          <span className="text-zinc-600">{connected ? "ok" : "disconnected"}</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          /new
        </button>
      </div>
    </header>
  );
}
