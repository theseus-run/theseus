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
  DispatchEventEntry,
  DispatchSession,
  MissionSession,
  ResearchPocEvent,
  WorkNodeState,
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
  readonly dispatchId?: string;
  readonly meta?: string;
  readonly body?: string;
  readonly state?: WorkNodeState;
  readonly children?: ReadonlyArray<TreeNode>;
}

interface DispatchTranscript {
  readonly dispatchId: string;
  readonly name: string;
  readonly events: ReadonlyArray<DispatchEventEntry>;
}

interface PocError {
  readonly title: string;
  readonly detail: string;
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

const eventLine = (event: DispatchEvent): string => {
  switch (event._tag) {
    case "Calling":
      return `calling iteration ${event.iteration ?? "?"}`;
    case "Text":
      return event.content ?? "";
    case "Thinking":
      return `[thinking] ${event.content ?? ""}`;
    case "ToolCalling":
      return `-> ${event.tool ?? "tool"} ${JSON.stringify(event.args ?? {})}`;
    case "ToolResult":
      return `<- ${event.tool ?? "tool"}${event.isError ? " error" : ""}: ${event.content ?? ""}`;
    case "ToolError":
      return `tool error ${event.tool ?? "tool"}: ${JSON.stringify(event.error ?? {})}`;
    case "Injected":
      return `injected ${event.injection ?? ""}${event.detail ? `: ${event.detail}` : ""}`;
    case "Done":
      return `done: ${event.result?.content ?? ""}`;
    case "Failed":
      return `failed: ${event.reason ?? "unknown reason"}`;
    case "SatelliteAction":
      return `satellite ${event.satellite ?? ""} ${event.phase ?? ""}: ${event.action ?? ""}`;
    default:
      return event._tag;
  }
};

const eventKey = (entry: DispatchEventEntry): string =>
  `${entry.dispatchId}:${entry.timestamp}:${entry.event._tag}:${eventLine(entry.event).slice(0, 160)}`;

const errorDetail = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
  const [failureReason, setFailureReason] = useState<string>("");
  const [pocError, setPocError] = useState<PocError | null>(null);
  const [transcripts, setTranscripts] = useState<ReadonlyArray<DispatchTranscript>>([]);
  const { entries, append, clear } = useEntries();
  const coordinatorId = useRef<string | null>(null);

  const refreshDispatches = useCallback(async () => {
    const listed = await client.listRuntimeDispatches(20);
    setDispatches(listed);
    const relevant = listed.filter(
      (session) =>
        coordinatorId.current === null ||
        session.dispatchId === coordinatorId.current ||
        session.parentWorkNodeId ===
          listed.find((candidate) => candidate.dispatchId === coordinatorId.current)?.workNodeId,
    );
    const loaded = await Promise.all(
      relevant.map(async (session): Promise<DispatchTranscript> => {
        try {
          return {
            dispatchId: session.dispatchId,
            name: session.name,
            events: await client.getDispatchEvents(session.dispatchId),
          };
        } catch {
          return { dispatchId: session.dispatchId, name: session.name, events: [] };
        }
      }),
    );
    setTranscripts(loaded);
  }, []);

  const handleEvent = useCallback(
    (event: ResearchPocEvent) => {
      if (event._tag === "MissionCreated") {
        setMission(event.mission);
        append(`mission ${event.mission.missionId}`);
        return;
      }

      if (event._tag === "WorkNodeStarted") {
        append(`${event.node.relation} ${event.node.kind} ${event.node.label}`);
        return;
      }

      if (event._tag === "DispatchSessionStarted") {
        const isRoot = event.session.relation === "root";
        if (isRoot) {
          coordinatorId.current = event.session.dispatchId;
          setCoordinator(event.session);
        }
        setDispatches((prev) => [event.session, ...prev]);
        append(`${isRoot ? "coordinator" : "dispatch"} ${event.session.dispatchId}`);
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
        const name = dispatchEvent.name ?? "dispatch";
        const reason = dispatchEvent.reason ?? "dispatch failed";
        setFailureReason(reason);
        setPocError({
          title: `${name} failed`,
          detail: reason,
        });
        setCoordinator((current) => (current ? { ...current, state: "failed" } : current));
        setMission((current) => (current ? { ...current, state: "failed" } : current));
        append(`${name} failed: ${reason}`);
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
    setFailureReason("");
    setPocError(null);
    setTranscripts([]);
    coordinatorId.current = null;
    clear();

    let poll: ReturnType<typeof setInterval> | undefined;
    try {
      poll = setInterval(() => {
        void refreshDispatches();
      }, 1500);
      await client.startResearchPoc({ goal: goal.trim() }, handleEvent);
      await refreshDispatches();
    } catch (error) {
      const detail = errorDetail(error);
      setPocError({ title: "stream failed", detail });
      append(detail);
    } finally {
      if (poll !== undefined) clearInterval(poll);
      setRunning(false);
    }
  }, [append, clear, goal, handleEvent, refreshDispatches, running]);

  const gruntSession = dispatches.find(
    (session) => session.parentWorkNodeId === coordinator?.workNodeId,
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
                    dispatchId: coordinator.dispatchId,
                    meta: [coordinator.state, modelLabel(coordinator)].filter(Boolean).join(" / "),
                    body: failureReason || coordinatorFinal || "Waiting for coordinator summary...",
                    state: coordinator.state,
                    children:
                      gruntSession === undefined && gruntReport === null
                        ? []
                        : [
                            {
                              id: gruntReport?.dispatchId ?? gruntSession?.dispatchId ?? "grunt",
                              label: `Research Grunt${
                                gruntReport === null ? "" : `: ${gruntReport.target}`
                              }`,
                              dispatchId: gruntReport?.dispatchId ?? gruntSession?.dispatchId,
                              meta: [gruntSession?.state ?? "running", modelLabel(gruntSession)]
                                .filter(Boolean)
                                .join(" / "),
                              body:
                                gruntReport === null
                                  ? "Inspecting repository and preparing report..."
                                  : reportSummary(gruntReport),
                              state: gruntSession?.state ?? "running",
                              children:
                                gruntReport === null
                                  ? []
                                  : [
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

        {pocError !== null && (
          <div className="border border-red-900/60 bg-red-950/20 p-3">
            <div className="text-red-200 uppercase tracking-wider font-semibold">
              {pocError.title}
            </div>
            <div className="text-red-100 whitespace-pre-wrap mt-2">{pocError.detail}</div>
          </div>
        )}

        <div className="border border-border p-3">
          <div className="text-muted-foreground uppercase tracking-wider mb-3">mission tree</div>
          {tree === null ? (
            <div className="text-zinc-600">-- no mission --</div>
          ) : (
            <TreeView node={tree} entries={entries} transcripts={transcripts} />
          )}
        </div>
      </div>
    </div>
  );
}

function TreeView({
  node,
  entries,
  transcripts,
  depth = 0,
}: {
  readonly node: TreeNode;
  readonly entries: ReadonlyArray<LogEntry>;
  readonly transcripts: ReadonlyArray<DispatchTranscript>;
  readonly depth?: number;
}) {
  const transcript =
    node.dispatchId === undefined
      ? undefined
      : transcripts.find((candidate) => candidate.dispatchId === node.dispatchId);
  const isRoot = depth === 0;

  return (
    <div className={isRoot ? "" : "ml-5 border-l border-border pl-4 mt-3"}>
      <div className="border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-foreground font-semibold">{node.label}</div>
          {node.meta && <div className="text-xs text-muted-foreground">{node.meta}</div>}
        </div>
        {node.body && (
          <div className="text-sm text-zinc-300 whitespace-pre-wrap mt-2">{node.body}</div>
        )}
        {isRoot && entries.length > 0 && (
          <details className="mt-3 border-t border-border pt-3">
            <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">
              mission events
            </summary>
            <div className="font-mono text-xs space-y-1 mt-2">
              {entries.map((entry) => (
                <div key={entry.id} className="text-zinc-300 break-words">
                  {entry.line}
                </div>
              ))}
            </div>
          </details>
        )}
        {transcript !== undefined && (
          <DispatchLog
            transcript={transcript}
            defaultOpen={transcript.name === "poc-research-grunt"}
          />
        )}
      </div>
      {node.children?.map((child) => (
        <TreeView
          key={child.id}
          node={child}
          entries={entries}
          transcripts={transcripts}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function DispatchLog({
  transcript,
  defaultOpen,
}: {
  readonly transcript: DispatchTranscript;
  readonly defaultOpen: boolean;
}) {
  return (
    <details open={defaultOpen} className="mt-3 border-t border-border pt-3">
      <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">
        dispatch log
        <span className="normal-case tracking-normal ml-2">{transcript.dispatchId}</span>
      </summary>
      <div className="font-mono text-xs space-y-2 mt-3 max-h-[420px] overflow-y-auto">
        {transcript.events.length === 0 ? (
          <div className="text-zinc-600">-- no events --</div>
        ) : (
          transcript.events.map((entry) => (
            <div key={eventKey(entry)}>
              <div className="text-muted-foreground">{entry.event._tag}</div>
              <div className="text-zinc-300 whitespace-pre-wrap break-words">
                {eventLine(entry.event)}
              </div>
            </div>
          ))
        )}
      </div>
    </details>
  );
}
