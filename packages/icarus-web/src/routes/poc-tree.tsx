/**
 * Nested research POC — server-owned coordinator -> grunt flow.
 *
 * The browser sends only a goal. Server/runtime own models, tools, and
 * blueprint authority for this path.
 */

import { useCallback, useRef, useState } from "react";
import { client } from "@/lib/client";
import type {
  DispatchEvent,
  DispatchSession,
  MissionSession,
  ResearchPocEvent,
} from "@/lib/rpc-client";

interface ReportPacket {
  readonly _tag: "Reported" | "Unstructured";
  readonly target: string;
  readonly dispatchId: string;
  readonly report?: {
    readonly summary: string;
    readonly content: string;
    readonly evidence?: ReadonlyArray<{ readonly text: string; readonly ref?: string }>;
  };
  readonly salvage?: {
    readonly summary: string;
    readonly content: string;
  };
}

interface LogEntry {
  readonly id: number;
  readonly line: string;
}

interface TreeNode {
  readonly id: string;
  readonly label: string;
  readonly meta?: string;
  readonly body?: string;
  readonly state?: "running" | "done" | "failed";
  readonly children?: ReadonlyArray<TreeNode>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isReportPacket = (value: unknown): value is ReportPacket =>
  isRecord(value) &&
  (value["_tag"] === "Reported" || value["_tag"] === "Unstructured") &&
  typeof value["target"] === "string" &&
  typeof value["dispatchId"] === "string";

const modelLabel = (session: DispatchSession | undefined): string | undefined =>
  session?.modelRequest === undefined
    ? undefined
    : `${session.modelRequest.provider}/${session.modelRequest.model}`;

const reportSummary = (packet: ReportPacket): string =>
  packet._tag === "Reported"
    ? (packet.report?.summary ?? "reported")
    : (packet.salvage?.summary ?? "unstructured");

const reportBody = (packet: ReportPacket): string =>
  packet._tag === "Reported" ? (packet.report?.content ?? "") : (packet.salvage?.content ?? "");

const finalText = (event: DispatchEvent): string | undefined =>
  event._tag === "Done" ? event.result?.content : undefined;

const useEntries = () => {
  const nextId = useRef(0);
  const [entries, setEntries] = useState<ReadonlyArray<LogEntry>>([]);
  const append = useCallback((line: string) => {
    const id = nextId.current;
    nextId.current += 1;
    setEntries((prev) => [...prev, { id, line }]);
  }, []);
  const clear = useCallback(() => {
    nextId.current = 0;
    setEntries([]);
  }, []);
  return { entries, append, clear };
};

export function RuntimeTreePocPage() {
  const [goal, setGoal] = useState(
    "Ask a research grunt to inspect this repository and report what it is.",
  );
  const [running, setRunning] = useState(false);
  const [mission, setMission] = useState<MissionSession | null>(null);
  const [coordinator, setCoordinator] = useState<DispatchSession | null>(null);
  const [dispatches, setDispatches] = useState<ReadonlyArray<DispatchSession>>([]);
  const [gruntReport, setGruntReport] = useState<ReportPacket | null>(null);
  const [coordinatorFinal, setCoordinatorFinal] = useState<string>("");
  const { entries, append, clear } = useEntries();
  const coordinatorId = useRef<string | null>(null);

  const refreshDispatches = useCallback(async () => {
    const listed = await client.listRuntimeDispatches(20);
    setDispatches(listed);
  }, []);

  const handleEvent = useCallback(
    (event: ResearchPocEvent) => {
      if (event._tag === "MissionCreated") {
        setMission(event.mission);
        append(`mission ${event.mission.missionId}`);
        return;
      }

      if (event._tag === "DispatchSessionStarted") {
        coordinatorId.current = event.session.dispatchId;
        setCoordinator(event.session);
        setDispatches((prev) => [event.session, ...prev]);
        append(`coordinator ${event.session.dispatchId}`);
        return;
      }

      const dispatchEvent = event.event;
      if (dispatchEvent._tag === "ToolCalling") {
        append(`${dispatchEvent.name} -> ${dispatchEvent.tool}`);
      }
      if (dispatchEvent._tag === "ToolResult" && isReportPacket(dispatchEvent.structured)) {
        setGruntReport(dispatchEvent.structured);
        append(`grunt report ${dispatchEvent.structured.dispatchId}`);
      }
      const done = finalText(dispatchEvent);
      if (done !== undefined) {
        setCoordinatorFinal(done);
        setCoordinator((current) => (current ? { ...current, state: "done" } : current));
        setMission((current) => (current ? { ...current, state: "done" } : current));
        append(`${dispatchEvent.name} done`);
      }
      if (dispatchEvent._tag === "Failed") {
        setCoordinator((current) => (current ? { ...current, state: "failed" } : current));
        setMission((current) => (current ? { ...current, state: "failed" } : current));
        append(`${dispatchEvent.name} failed`);
      }
    },
    [append],
  );

  const run = useCallback(async () => {
    if (!goal.trim() || running) return;
    setRunning(true);
    setMission(null);
    setCoordinator(null);
    setDispatches([]);
    setGruntReport(null);
    setCoordinatorFinal("");
    coordinatorId.current = null;
    clear();

    try {
      await client.startResearchPoc({ goal: goal.trim() }, handleEvent);
      await refreshDispatches();
    } catch (error) {
      append(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }, [append, clear, goal, handleEvent, refreshDispatches, running]);

  const gruntSession = dispatches.find(
    (session) => session.parentDispatchId === coordinator?.dispatchId,
  );

  const tree: TreeNode | null =
    mission === null
      ? null
      : {
          id: mission.missionId,
          label: "Mission",
          meta: `${mission.state} / ${mission.capsuleId}`,
          body: mission.goal,
          children:
            coordinator === null
              ? []
              : [
                  {
                    id: coordinator.dispatchId,
                    label: "Coordinator",
                    meta: [coordinator.state, modelLabel(coordinator)].filter(Boolean).join(" / "),
                    body: coordinatorFinal || "Waiting for coordinator summary...",
                    state: coordinator.state,
                    children:
                      gruntReport === null
                        ? []
                        : [
                            {
                              id: gruntReport.dispatchId,
                              label: `Research Grunt: ${gruntReport.target}`,
                              meta: [gruntSession?.state ?? "done", modelLabel(gruntSession)]
                                .filter(Boolean)
                                .join(" / "),
                              body: reportSummary(gruntReport),
                              state: gruntSession?.state ?? "done",
                              children: [
                                {
                                  id: `${gruntReport.dispatchId}:report`,
                                  label: "Structured Report",
                                  body: reportBody(gruntReport),
                                },
                              ],
                            },
                          ],
                  },
                ],
        };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground uppercase tracking-wider font-semibold">
              nested research poc
            </h1>
            <p className="text-muted-foreground">
              mission {"->"} coordinator {"->"} research grunt {"->"} report
            </p>
          </div>
          <button type="button" onClick={run} disabled={running || !goal.trim()} className="btn">
            {running ? "running" : "run"}
          </button>
        </div>

        <textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          rows={4}
          className="input"
          placeholder="mission goal..."
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="border border-border p-3">
            <div className="text-muted-foreground uppercase tracking-wider mb-3">tree</div>
            {tree === null ? (
              <div className="text-zinc-600">-- no mission --</div>
            ) : (
              <TreeView node={tree} />
            )}
          </div>

          <div className="border border-border p-3">
            <div className="text-muted-foreground uppercase tracking-wider mb-3">events</div>
            <div className="font-mono text-sm space-y-1">
              {entries.length === 0 && <div className="text-zinc-600">-- no events --</div>}
              {entries.map((entry) => (
                <div key={entry.id} className="text-foreground break-words">
                  {entry.line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeView({ node, depth = 0 }: { readonly node: TreeNode; readonly depth?: number }) {
  return (
    <div className={depth === 0 ? "" : "ml-5 border-l border-border pl-4 mt-3"}>
      <div className="border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-foreground font-semibold">{node.label}</div>
          {node.meta && <div className="text-xs text-muted-foreground">{node.meta}</div>}
        </div>
        {node.body && (
          <div className="text-sm text-zinc-300 whitespace-pre-wrap mt-2">{node.body}</div>
        )}
      </div>
      {node.children?.map((child) => (
        <TreeView key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
