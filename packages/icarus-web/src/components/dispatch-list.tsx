/**
 * DispatchList — landing page showing dispatch history.
 */

import type { DispatchSummary } from "@theseus.run/core/Dispatch";
import { nowMillis } from "@/lib/time";
import { cn } from "@/lib/utils";

interface DispatchListProps {
  dispatches: ReadonlyArray<DispatchSummary>;
  loading: boolean;
  onSelect: (dispatchId: string) => void;
  onNew: () => void;
}

const statusIcon: Record<string, string> = {
  running: "●",
  done: "✓",
  failed: "✗",
};

const statusColor: Record<string, string> = {
  running: "text-cyan-500",
  done: "text-emerald-500",
  failed: "text-red-400",
};

function formatTime(ts: number): string {
  const diffMs = nowMillis() - ts;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatTokens(usage: { inputTokens: number; outputTokens: number }): string {
  const total = usage.inputTokens + usage.outputTokens;
  if (total === 0) return "";
  if (total < 1000) return `${total}t`;
  return `${(total / 1000).toFixed(1)}kt`;
}

export function DispatchList({ dispatches, loading, onSelect, onNew }: DispatchListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-xs text-zinc-500">dispatches</span>
        <button
          type="button"
          onClick={onNew}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          + new
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && dispatches.length === 0 && (
          <div className="flex items-center justify-center min-h-[200px] text-zinc-700 text-sm">
            loading...
          </div>
        )}

        {!loading && dispatches.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
            <div className="text-zinc-700 text-sm">no dispatches yet</div>
            <button
              type="button"
              onClick={onNew}
              className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded px-3 py-1.5 transition-colors"
            >
              start a dispatch
            </button>
          </div>
        )}

        {dispatches.map((d) => (
          <button
            key={d.dispatchId}
            type="button"
            onClick={() => onSelect(d.dispatchId)}
            className="w-full text-left px-4 py-2.5 border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors group"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={cn("text-xs", statusColor[d.status] ?? "text-zinc-500")}>
                  {statusIcon[d.status] ?? "?"}
                </span>
                <span className="text-xs text-zinc-300 truncate">{d.agent || "unknown"}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-600 shrink-0">
                {formatTokens(d.usage) && <span>{formatTokens(d.usage)}</span>}
                <span>{formatTime(d.startedAt)}</span>
              </div>
            </div>
            <div className="text-[11px] text-zinc-600 mt-0.5 truncate pl-5">
              {d.dispatchId.slice(0, 12)}...
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
