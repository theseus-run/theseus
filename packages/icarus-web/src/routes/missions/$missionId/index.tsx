/**
 * Mission Control — the real UI.
 *
 * Layout:
 *   Top:     mission header (goal, status)
 *   Left:    activity feed + input (the main area)
 *   Right:   criteria progress + artifacts (sidebar)
 */

import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { missions } from "@/lib/queries";
import type { Mission } from "@/lib/queries";

// ---------------------------------------------------------------------------
// Criteria sidebar (right)
// ---------------------------------------------------------------------------

function CriteriaSidebar({ mission }: { mission: Mission }) {
  const met = mission.criteria.filter((c) => c.status === "met").length;
  const total = mission.criteria.length;

  return (
    <div className="h-full overflow-y-auto p-4 border-l border-border">
      {/* Progress */}
      {total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-muted-foreground">
              [{met}/{total}]
            </span>
            <span className="text-muted-foreground">
              {Math.round((met / total) * 100)}%
            </span>
          </div>
          <div className="h-px bg-secondary overflow-hidden relative">
            <div
              className="h-full bg-green-500 absolute left-0 top-0 transition-all duration-500"
              style={{ width: `${(met / total) * 100}%`, height: "2px" }}
            />
          </div>
        </div>
      )}

      {/* Criteria */}
      <div className="mb-6">
        <h3 className="text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
          criteria
        </h3>
        <ul className="space-y-1.5">
          {mission.criteria.map((c, i) => (
            <li key={i} className="flex items-start gap-1">
              <span className="shrink-0">
                {c.status === "met" ? (
                  <span className="text-green-400">[x]</span>
                ) : c.status === "failed" ? (
                  <span className="text-red-400">[!]</span>
                ) : (
                  <span className="text-zinc-600">[ ]</span>
                )}
              </span>
              <span
                className={
                  c.status === "met"
                    ? "text-green-400"
                    : c.status === "failed"
                      ? "text-red-400 line-through"
                      : "text-foreground"
                }
              >
                {c.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Artifacts */}
      {mission.artifacts.length > 0 && (
        <div>
          <h3 className="text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
            artifacts
          </h3>
          <ul className="space-y-1">
            {mission.artifacts.map((a, i) => (
              <li key={i}>
                <span className="text-zinc-600">
                  [{a.direction === "input" ? "in" : "out"}]
                </span>{" "}
                <span className="text-muted-foreground">{a.source}:</span>{" "}
                <span className="text-foreground">{a.title || a.ref}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

interface ActivityEntry {
  id: string;
  agent: string;
  action: string;
  detail?: string;
  timestamp: string;
  kind: "tool" | "dispatch" | "status" | "error";
}

const STUB_ACTIVITY: ActivityEntry[] = [
  { id: "1", agent: "theseus", action: "dispatch", detail: "[atlas] plan the OAuth2 migration", timestamp: "10:05", kind: "dispatch" },
  { id: "2", agent: "atlas", action: "grep", detail: "session|cookie|auth", timestamp: "10:05", kind: "tool" },
  { id: "3", agent: "atlas", action: "read_file", detail: "src/auth/session.ts", timestamp: "10:05", kind: "tool" },
  { id: "4", agent: "atlas", action: "read_file", detail: "src/auth/middleware.ts", timestamp: "10:06", kind: "tool" },
  { id: "5", agent: "atlas", action: "outline", detail: "src/auth/", timestamp: "10:06", kind: "tool" },
  { id: "6", agent: "atlas", action: "done", detail: "plan ready: 4 phases, 12 files", timestamp: "10:07", kind: "status" },
  { id: "7", agent: "theseus", action: "dispatch", detail: "[forge-1] implement Google OAuth handler", timestamp: "10:07", kind: "dispatch" },
  { id: "8", agent: "forge-1", action: "write_file", detail: "src/auth/oauth-google.ts", timestamp: "10:08", kind: "tool" },
  { id: "9", agent: "forge-1", action: "search_replace", detail: "src/auth/router.ts", timestamp: "10:08", kind: "tool" },
  { id: "10", agent: "forge-1", action: "shell", detail: "bun test src/auth/", timestamp: "10:09", kind: "tool" },
  { id: "11", agent: "theseus", action: "criterion", detail: "[met] OAuth2 login flow works for Google", timestamp: "10:09", kind: "status" },
  { id: "12", agent: "theseus", action: "dispatch", detail: "[forge-1] implement GitHub OAuth handler", timestamp: "10:10", kind: "dispatch" },
  { id: "13", agent: "forge-1", action: "write_file", detail: "src/auth/oauth-github.ts", timestamp: "10:10", kind: "tool" },
  { id: "14", agent: "forge-1", action: "shell", detail: "bun test src/auth/", timestamp: "10:11", kind: "tool" },
  { id: "15", agent: "theseus", action: "criterion", detail: "[met] OAuth2 login flow works for GitHub", timestamp: "10:11", kind: "status" },
  { id: "16", agent: "forge-1", action: "search_replace", detail: "src/auth/session.ts", timestamp: "10:12", kind: "tool" },
];

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="overflow-y-auto p-4 space-y-0">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-baseline gap-1 leading-relaxed">
          <span className="text-zinc-600 w-12 text-right shrink-0">{entry.timestamp}</span>
          <span
            className={`w-20 shrink-0 ${
              entry.agent === "theseus"
                ? "text-blue-400"
                : entry.agent === "atlas"
                  ? "text-purple-400"
                  : "text-green-400"
            }`}
          >
            {entry.agent}
          </span>
          <span
            className={
              entry.kind === "dispatch"
                ? "text-blue-300"
                : entry.kind === "status"
                  ? "text-yellow-300"
                  : entry.kind === "error"
                    ? "text-red-400"
                    : "text-zinc-500"
            }
          >
            {entry.action}
          </span>
          {entry.detail && (
            <span className="text-zinc-500 truncate">{entry.detail}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mission header
// ---------------------------------------------------------------------------

function MissionHeader({
  mission,
  onClose,
}: {
  mission: Mission;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={
            mission.status === "active"
              ? "text-blue-400"
              : mission.status === "closed"
                ? "text-zinc-500"
                : "text-yellow-400"
          }
        >
          [{mission.status}]
        </span>
        <p className="text-foreground truncate">{mission.goal}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {mission.status === "active" && (
          <button onClick={onClose} className="btn">
            close
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input bar (inside feed area)
// ---------------------------------------------------------------------------

function FeedInput({
  onInject,
  onStop,
  disabled,
}: {
  onInject: (text: string) => void;
  onStop: () => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    onInject(input.trim());
    setInput("");
  }, [input, onInject]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0">&gt;</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "mission closed" : "inject, steer, redirect..."}
          className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <button onClick={onStop} disabled={disabled} className="btn btn-danger">
          stop
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function MissionControlPage() {
  const { missionId } = useParams({ strict: false }) as { missionId: string };
  const navigate = useNavigate();
  const { data: mission } = useQuery(missions.detail(missionId));

  const handleClose = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  const handleInject = useCallback((_text: string) => {
    // TODO: injectToMission RPC
  }, []);

  const handleStop = useCallback(() => {
    // TODO: interrupt active dispatch
  }, []);

  if (!mission) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <MissionHeader mission={mission} onClose={handleClose} />

      <div className="flex flex-1 overflow-hidden ">
        {/* Feed + input (main area, left) */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <ActivityFeed entries={STUB_ACTIVITY} />
          </div>
          <FeedInput
            onInject={handleInject}
            onStop={handleStop}
            disabled={mission.status === "closed"}
          />
        </div>

        {/* Criteria sidebar (right) */}
        <div className="w-[280px] shrink-0">
          <CriteriaSidebar mission={mission} />
        </div>
      </div>
    </div>
  );
}
