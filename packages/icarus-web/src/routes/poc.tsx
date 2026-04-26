/**
 * Runtime POC — isolated e2e page for mission/session RPC binding.
 *
 * This intentionally does not drive the redesigned mission UI. It exercises
 * the runtime-native path directly: createMission -> startMissionDispatch ->
 * stream RuntimeDispatchEvent.
 */

import { useCallback, useRef, useState } from "react";
import { client } from "@/lib/client";
import type { DispatchEvent, DispatchSession, MissionSession } from "@/lib/rpc-client";

const BLUEPRINT = {
  name: "poc-coordinator",
  systemPrompt:
    "You are a concise coding coordinator. Use tools when useful and report the result clearly.",
  tools: [
    { name: "read_file" },
    { name: "list_dir" },
    { name: "glob" },
    { name: "grep" },
    { name: "outline" },
    { name: "search_replace" },
    { name: "write_file" },
    { name: "shell" },
  ],
  maxIterations: 30,
};

interface TranscriptEntry {
  readonly id: number;
  readonly text: string;
  readonly kind: "runtime" | "agent" | "tool" | "result" | "error";
}

const describeDispatchEvent = (event: DispatchEvent): TranscriptEntry["kind"] => {
  if (event._tag === "ToolCalling" || event._tag === "ToolResult" || event._tag === "ToolError") {
    return "tool";
  }
  if (event._tag === "Done") return "result";
  if (event._tag === "Failed") return "error";
  return "agent";
};

const eventLine = (event: DispatchEvent): string => {
  if (event._tag === "ToolCalling") {
    return `[${event.name}] -> ${event.tool} ${JSON.stringify(event.args)}`;
  }
  if (event._tag === "ToolResult") {
    return `[${event.name}] <- ${event.tool}${event.isError ? " ERROR" : ""}: ${event.content ?? ""}`;
  }
  if (event._tag === "ToolError") {
    return `[${event.name}] !! ${event.tool}: ${JSON.stringify(event.error)}`;
  }
  if (event._tag === "Text" && event.content) {
    return `[${event.name}] ${event.content}`;
  }
  if (event._tag === "Done") {
    return `[${event.name}] done: ${event.result?.content ?? ""}`;
  }
  if (event._tag === "Failed") {
    return `[${event.name}] failed`;
  }
  return `[${event.name ?? "agent"}] ${event._tag}`;
};

export function RuntimePocPage() {
  const [task, setTask] = useState("List the repository root and summarize what this project is.");
  const [running, setRunning] = useState(false);
  const [mission, setMission] = useState<MissionSession | null>(null);
  const [dispatch, setDispatch] = useState<DispatchSession | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const nextId = useRef(0);

  const append = useCallback((kind: TranscriptEntry["kind"], text: string) => {
    const id = nextId.current;
    nextId.current += 1;
    setEntries((prev) => [...prev, { id, kind, text }]);
  }, []);

  const run = useCallback(async () => {
    if (!task.trim() || running) return;
    setRunning(true);
    setEntries([]);
    setMission(null);
    setDispatch(null);
    nextId.current = 0;

    try {
      const created = await client.createMission({
        slug: "runtime-poc",
        goal: task.trim(),
        criteria: [],
      });
      setMission(created);
      append("runtime", `mission ${created.missionId} capsule ${created.capsuleId}`);
      append("runtime", "startMissionDispatch request sent");

      await client.startMissionDispatch(
        { missionId: created.missionId, spec: BLUEPRINT, task: task.trim() },
        (event) => {
          if (event._tag === "DispatchSessionStarted") {
            setDispatch(event.session);
            append(
              "runtime",
              `dispatch ${event.session.dispatchId} mission ${event.session.missionId} capsule ${event.session.capsuleId}`,
            );
            return;
          }
          append(describeDispatchEvent(event.event), eventLine(event.event));
        },
      );
    } catch (error) {
      append("error", error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }, [append, running, task]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-5xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground uppercase tracking-wider font-semibold">runtime poc</h1>
            <p className="text-muted-foreground">
              create mission {"->"} start dispatch {"->"} stream runtime events
            </p>
          </div>
          <button type="button" onClick={run} disabled={running || !task.trim()} className="btn">
            {running ? "running" : "run"}
          </button>
        </div>

        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          rows={4}
          className="input"
          placeholder="task for the coordinator..."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border border-border p-3">
            <div className="text-muted-foreground uppercase tracking-wider mb-2">mission</div>
            <pre className="whitespace-pre-wrap text-zinc-400">
              {mission ? JSON.stringify(mission, null, 2) : "--"}
            </pre>
          </div>
          <div className="border border-border p-3">
            <div className="text-muted-foreground uppercase tracking-wider mb-2">dispatch</div>
            <pre className="whitespace-pre-wrap text-zinc-400">
              {dispatch ? JSON.stringify(dispatch, null, 2) : "--"}
            </pre>
          </div>
        </div>

        <div className="border border-border">
          <div className="px-3 py-2 border-b border-border text-muted-foreground uppercase tracking-wider">
            transcript
          </div>
          <div className="p-3 space-y-1 font-mono text-sm">
            {entries.length === 0 && <div className="text-zinc-600">-- no events --</div>}
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-2">
                <span className="text-zinc-600 w-16 shrink-0">[{entry.kind}]</span>
                <span className="text-foreground whitespace-pre-wrap break-words">
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
