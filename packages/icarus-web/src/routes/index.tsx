/**
 * Runtime workbench — single-root operator playground.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import {
  QueueItem,
  QueueItemHeader,
  QueueItemSummary,
  QueueItemTitle,
} from "@/components/ui/queue-item";
import { StatusMark } from "@/components/ui/status-mark";
import { Token } from "@/components/ui/token";
import { client } from "@/lib/client";
import type {
  DispatchEvent,
  DispatchEventEntry,
  DispatchSession,
  MissionSession,
  ResearchPocEvent,
  WorkNodeSession,
  WorkNodeState,
} from "@/lib/rpc-client";

interface ReportPacket {
  readonly _tag: "Reported" | "Unstructured";
  readonly target: string;
  readonly dispatchId: string;
  readonly report?: {
    readonly summary: string;
    readonly content: string;
  };
  readonly salvage?: {
    readonly summary: string;
    readonly content: string;
  };
}

interface DispatchTranscript {
  readonly dispatchId: string;
  readonly name: string;
  readonly events: ReadonlyArray<DispatchEventEntry>;
}

interface WorkbenchState {
  readonly missions: ReadonlyArray<MissionSession>;
  readonly mission: MissionSession | null;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly transcripts: ReadonlyArray<DispatchTranscript>;
}

type InspectorSelection =
  | { readonly _tag: "mission"; readonly missionId: string }
  | { readonly _tag: "node"; readonly workNodeId: string };

const defaultGoal = "Ask a research grunt to inspect this repository and report what it is.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isReportPacket = (value: unknown): value is ReportPacket =>
  isRecord(value) &&
  (value["_tag"] === "Reported" || value["_tag"] === "Unstructured") &&
  typeof value["target"] === "string" &&
  typeof value["dispatchId"] === "string";

const missionIdFromLocation = (): string | undefined => {
  const id = new URLSearchParams(window.location.search).get("missionId");
  return id ?? undefined;
};

const replaceMissionId = (missionId: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("missionId", missionId);
  window.history.replaceState(null, "", url);
};

const stateTone = (state: WorkNodeState | MissionSession["state"]) =>
  state === "done"
    ? "good"
    : state === "running" || state === "pending"
      ? "process"
      : state === "failed" || state === "aborted"
        ? "danger"
        : "muted";

const stateSymbol = (state: WorkNodeState | MissionSession["state"]) =>
  state === "done"
    ? "ok"
    : state === "running"
      ? ">>"
      : state === "pending"
        ? ".."
        : state === "failed" || state === "aborted"
          ? "!!"
          : "--";

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
  `${entry.dispatchId}:${entry.timestamp}:${entry.event._tag}:${eventLine(entry.event).slice(0, 120)}`;

const reportFromEvents = (events: ReadonlyArray<DispatchEventEntry>): ReportPacket | undefined => {
  const entry = [...events]
    .reverse()
    .find((candidate) => isReportPacket(candidate.event.structured));
  return entry !== undefined && isReportPacket(entry.event.structured)
    ? entry.event.structured
    : undefined;
};

const finalTextFromEvents = (events: ReadonlyArray<DispatchEventEntry>): string | undefined =>
  [...events].reverse().find((entry) => entry.event._tag === "Done")?.event.result?.content;

const modelLabel = (session: DispatchSession | undefined): string =>
  session?.modelRequest == null
    ? "model --"
    : `${session.modelRequest.provider}/${session.modelRequest.model}`;

const emptyState: WorkbenchState = {
  missions: [],
  mission: null,
  nodes: [],
  dispatches: [],
  transcripts: [],
};

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const mergeBy = <A, K>(
  current: ReadonlyArray<A>,
  incoming: A,
  key: (value: A) => K,
): ReadonlyArray<A> => {
  const incomingKey = key(incoming);
  return [incoming, ...current.filter((value) => key(value) !== incomingKey)];
};

const sortMissions = (missions: ReadonlyArray<MissionSession>): ReadonlyArray<MissionSession> =>
  [...missions].sort((left, right) => right.capsuleId.localeCompare(left.capsuleId));

export function MissionListPage() {
  const [goal, setGoal] = useState(defaultGoal);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>("");
  const [selected, setSelected] = useState<InspectorSelection | null>(null);
  const [state, setState] = useState<WorkbenchState>(emptyState);
  const [initializing, setInitializing] = useState(true);
  const loadRequestId = useRef(0);

  const loadMission = useCallback(async (missionId?: string) => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    const isCurrentRequest = () => loadRequestId.current === requestId;
    try {
      const [loadedMissions, dispatches] = await Promise.all([
        client.listMissions(),
        client.listRuntimeDispatches(50),
      ]);
      if (!isCurrentRequest()) return;
      const missions = sortMissions(loadedMissions);
      const selectedMissionId = missionId ?? dispatches[0]?.missionId ?? missions[0]?.missionId;

      if (selectedMissionId === undefined) {
        setState((current) => ({ ...emptyState, missions, mission: current.mission }));
        return;
      }

      const mission = await client.getMission(selectedMissionId);
      if (!isCurrentRequest()) return;
      if (mission === null) {
        setState((current) => ({ ...current, missions }));
        return;
      }

      const [nodes, loadedDispatches] = await Promise.all([
        client.getMissionWorkTree(mission.missionId),
        Promise.resolve(dispatches.filter((dispatch) => dispatch.missionId === mission.missionId)),
      ]);
      const transcripts = await Promise.all(
        loadedDispatches.map(async (dispatch): Promise<DispatchTranscript> => {
          try {
            return {
              dispatchId: dispatch.dispatchId,
              name: dispatch.name,
              events: await client.getDispatchEvents(dispatch.dispatchId),
            };
          } catch {
            return { dispatchId: dispatch.dispatchId, name: dispatch.name, events: [] };
          }
        }),
      );
      if (!isCurrentRequest()) return;

      setState({ missions, mission, nodes, dispatches: loadedDispatches, transcripts });
      setSelected((current) => current ?? { _tag: "mission", missionId: mission.missionId });
      replaceMissionId(mission.missionId);
    } catch (cause) {
      if (isCurrentRequest()) {
        setError(errorMessage(cause));
      }
    } finally {
      if (isCurrentRequest()) {
        setInitializing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadMission(missionIdFromLocation());
  }, [loadMission]);

  const runResearchPoc = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed || running) return;
    setRunning(true);
    setError("");
    loadRequestId.current += 1;
    let runMissionId: string | undefined;
    try {
      await client.startResearchPoc({ goal: trimmed }, (event: ResearchPocEvent) => {
        if (event._tag === "MissionCreated") {
          runMissionId = event.mission.missionId;
          replaceMissionId(event.mission.missionId);
          setState((current) => ({
            ...current,
            missions: sortMissions(
              mergeBy(current.missions, event.mission, (mission) => mission.missionId),
            ),
            mission: event.mission,
          }));
          setSelected({ _tag: "mission", missionId: event.mission.missionId });
          return;
        }
        if (event._tag === "WorkNodeStarted") {
          setState((current) => ({
            ...current,
            nodes: mergeBy(current.nodes, event.node, (node) => node.workNodeId),
          }));
          return;
        }
        if (event._tag === "DispatchSessionStarted") {
          runMissionId = event.session.missionId;
          setState((current) => ({
            ...current,
            nodes: mergeBy(current.nodes, event.session, (node) => node.workNodeId),
            dispatches: mergeBy(
              current.dispatches,
              event.session,
              (dispatch) => dispatch.dispatchId,
            ),
          }));
          return;
        }
        if (event._tag === "DispatchEvent") {
          setState((current) => ({
            ...current,
            transcripts: mergeBy(
              current.transcripts,
              {
                dispatchId: event.dispatchId,
                name: event.event.name ?? event.dispatchId,
                events: [
                  ...(current.transcripts.find(
                    (transcript) => transcript.dispatchId === event.dispatchId,
                  )?.events ?? []),
                  {
                    dispatchId: event.dispatchId,
                    timestamp: Date.now(),
                    event: event.event,
                  },
                ],
              },
              (transcript) => transcript.dispatchId,
            ),
          }));
        }
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      await loadMission(runMissionId ?? missionIdFromLocation());
      setRunning(false);
    }
  }, [goal, loadMission, running]);

  const selectedNode =
    selected?._tag === "node"
      ? state.nodes.find((node) => node.workNodeId === selected.workNodeId)
      : undefined;
  const selectedMission =
    selected?._tag === "mission"
      ? state.mission
      : selectedNode === undefined
        ? state.mission
        : null;

  return (
    <div className="dashboard-shell h-full overflow-hidden">
      <div className="dashboard-frame h-full flex flex-col gap-[var(--panel-gap)]">
        <WorkbenchHeader
          mission={state.mission}
          running={running}
          goal={goal}
          onGoalChange={setGoal}
          onRun={runResearchPoc}
          error={error}
          initializing={initializing}
        />

        <div className="workbench-grid min-h-0 flex-1">
          <MissionRail
            missions={state.missions}
            selectedMissionId={state.mission?.missionId}
            initializing={initializing}
            onSelect={(missionId) => {
              setSelected({ _tag: "mission", missionId });
              void loadMission(missionId);
            }}
          />
          <WorkTreePanel
            mission={state.mission}
            nodes={state.nodes}
            dispatches={state.dispatches}
            selected={selected}
            initializing={initializing}
            onSelect={setSelected}
          />
          <InspectorPanel
            mission={selectedMission}
            node={selectedNode}
            dispatches={state.dispatches}
            transcripts={state.transcripts}
            initializing={initializing}
          />
        </div>
      </div>
    </div>
  );
}

function WorkbenchHeader({
  mission,
  running,
  goal,
  error,
  initializing,
  onGoalChange,
  onRun,
}: {
  readonly mission: MissionSession | null;
  readonly running: boolean;
  readonly goal: string;
  readonly error: string;
  readonly initializing: boolean;
  readonly onGoalChange: (value: string) => void;
  readonly onRun: () => void;
}) {
  return (
    <header className="border-b-[calc(var(--border)*3)] border-border pb-[var(--lh)]">
      <div className="flex flex-col gap-[calc(var(--lh)/2)] xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="label-text">Theseus / Runtime Workbench</p>
          <h1 className="heading-1">Mission tree playground.</h1>
          <p className="lede">
            Runtime-backed missions, delegated dispatches, reports, and dispatch logs in one
            operator surface.
          </p>
        </div>
        <div className="dashboard-kpis">
          <div>
            <span className="eyebrow">mission</span>
            <p>{mission?.missionId ?? (initializing ? "loading" : "--")}</p>
          </div>
          <div>
            <span className="eyebrow">state</span>
            <p>{mission?.state ?? (initializing ? "loading" : "--")}</p>
          </div>
          <div>
            <span className="eyebrow">capsule</span>
            <p>{mission?.capsuleId ?? (initializing ? "loading" : "--")}</p>
          </div>
        </div>
      </div>
      <div className="mt-[var(--lh)] grid gap-[calc(var(--lh)/2)] md:grid-cols-[minmax(0,1fr)_auto]">
        <textarea
          className="input min-h-[calc(var(--lh)*3)]"
          value={goal}
          onChange={(event) => onGoalChange(event.target.value)}
        />
        <Button onClick={onRun} disabled={running || !goal.trim()} className="md:min-w-[16ch]">
          {running ? "running" : "run research poc"}
        </Button>
      </div>
      {error && <div className="mt-[calc(var(--lh)/2)] text-red-300">{error}</div>}
    </header>
  );
}

function MissionRail({
  missions,
  selectedMissionId,
  initializing,
  onSelect,
}: {
  readonly missions: ReadonlyArray<MissionSession>;
  readonly selectedMissionId: string | undefined;
  readonly initializing: boolean;
  readonly onSelect: (missionId: string) => void;
}) {
  return (
    <aside className="min-h-0 overflow-auto">
      <Panel className="min-h-full">
        <PanelHeader>
          <PanelTitle>Missions</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <div className="grid gap-0">
            {missions.length === 0 ? (
              <div className="field text-muted-foreground">
                {initializing ? "-- loading missions --" : "-- no missions --"}
              </div>
            ) : (
              missions.map((mission) => (
                <QueueItem
                  key={mission.missionId}
                  className={
                    selectedMissionId === mission.missionId ? "dashboard-list-item-active" : ""
                  }
                  onClick={() => onSelect(mission.missionId)}
                >
                  <QueueItemHeader>
                    <QueueItemTitle>{mission.missionId}</QueueItemTitle>
                    <StatusMark symbol={stateSymbol(mission.state)} tone={stateTone(mission.state)}>
                      {mission.state}
                    </StatusMark>
                  </QueueItemHeader>
                  <QueueItemSummary>{mission.goal}</QueueItemSummary>
                </QueueItem>
              ))
            )}
          </div>
        </PanelBody>
      </Panel>
    </aside>
  );
}

function WorkTreePanel({
  mission,
  nodes,
  dispatches,
  selected,
  initializing,
  onSelect,
}: {
  readonly mission: MissionSession | null;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly selected: InspectorSelection | null;
  readonly initializing: boolean;
  readonly onSelect: (selection: InspectorSelection) => void;
}) {
  const roots = nodes.filter((node) => node.parentWorkNodeId == null);
  return (
    <main className="min-h-0 overflow-auto">
      <Panel className="min-h-full">
        <PanelHeader>
          <PanelTitle>Work Tree</PanelTitle>
        </PanelHeader>
        <PanelBody>
          {mission === null ? (
            <div className="field text-muted-foreground">
              {initializing ? "-- loading work tree --" : "-- no mission selected --"}
            </div>
          ) : (
            <div className="field">
              <button
                type="button"
                className={[
                  "workbench-tree-node",
                  selected?._tag === "mission" ? "workbench-tree-node-active" : "",
                ].join(" ")}
                onClick={() => onSelect({ _tag: "mission", missionId: mission.missionId })}
              >
                <span>Mission</span>
                <Token variant="plain">{mission.state}</Token>
              </button>
              <div className="mt-[calc(var(--lh)/2)]">
                {roots.map((node) => (
                  <WorkTreeNode
                    key={node.workNodeId}
                    node={node}
                    nodes={nodes}
                    dispatches={dispatches}
                    selected={selected}
                    depth={1}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          )}
        </PanelBody>
      </Panel>
    </main>
  );
}

function WorkTreeNode({
  node,
  nodes,
  dispatches,
  selected,
  depth,
  onSelect,
}: {
  readonly node: WorkNodeSession;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly selected: InspectorSelection | null;
  readonly depth: number;
  readonly onSelect: (selection: InspectorSelection) => void;
}) {
  const children = nodes.filter((candidate) => candidate.parentWorkNodeId === node.workNodeId);
  const dispatch = dispatches.find((candidate) => candidate.workNodeId === node.workNodeId);
  return (
    <div className="workbench-tree-branch" style={{ marginLeft: `${depth * 2}ch` }}>
      <button
        type="button"
        className={[
          "workbench-tree-node",
          selected?._tag === "node" && selected.workNodeId === node.workNodeId
            ? "workbench-tree-node-active"
            : "",
        ].join(" ")}
        onClick={() => onSelect({ _tag: "node", workNodeId: node.workNodeId })}
      >
        <span>{node.label}</span>
        <span className="flex flex-wrap gap-[1ch]">
          <Token variant="plain">{node.relation}</Token>
          <Token variant="plain">{node.state}</Token>
          {dispatch && <Token variant="plain">{modelLabel(dispatch)}</Token>}
        </span>
      </button>
      {children.map((child) => (
        <WorkTreeNode
          key={child.workNodeId}
          node={child}
          nodes={nodes}
          dispatches={dispatches}
          selected={selected}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function InspectorPanel({
  mission,
  node,
  dispatches,
  transcripts,
  initializing,
}: {
  readonly mission: MissionSession | null;
  readonly node: WorkNodeSession | undefined;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly transcripts: ReadonlyArray<DispatchTranscript>;
  readonly initializing: boolean;
}) {
  const dispatch = dispatches.find((candidate) => candidate.workNodeId === node?.workNodeId);
  const transcript = transcripts.find((candidate) => candidate.dispatchId === dispatch?.dispatchId);
  const report = transcript === undefined ? undefined : reportFromEvents(transcript.events);
  const final = transcript === undefined ? undefined : finalTextFromEvents(transcript.events);

  return (
    <aside className="min-h-0 overflow-auto">
      <Panel className="min-h-full">
        <PanelHeader>
          <PanelTitle>Inspector</PanelTitle>
        </PanelHeader>
        <PanelBody>
          {initializing && mission === null && node === undefined ? (
            <div className="field text-muted-foreground">-- loading runtime state --</div>
          ) : node === undefined ? (
            <MissionInspector mission={mission} />
          ) : (
            <div className="field rhythm">
              <div>
                <h2 className="heading-2">{node.label}</h2>
                <div className="flex flex-wrap gap-[1ch]">
                  <Token>{node.kind}</Token>
                  <Token>{node.relation}</Token>
                  <Token tone={stateTone(node.state)}>{node.state}</Token>
                  {dispatch && <Token>{modelLabel(dispatch)}</Token>}
                </div>
              </div>
              {report !== undefined && (
                <section className="dashboard-note">
                  <p className="eyebrow">structured report</p>
                  <p>
                    {report._tag === "Reported" ? report.report?.summary : report.salvage?.summary}
                  </p>
                  <pre className="payload-block mt-[calc(var(--lh)/2)]">
                    {report._tag === "Reported" ? report.report?.content : report.salvage?.content}
                  </pre>
                </section>
              )}
              {final !== undefined && (
                <section className="dashboard-note">
                  <p className="eyebrow">final</p>
                  <p className="whitespace-pre-wrap">{final}</p>
                </section>
              )}
              <DispatchLog transcript={transcript} />
            </div>
          )}
        </PanelBody>
      </Panel>
    </aside>
  );
}

function MissionInspector({ mission }: { readonly mission: MissionSession | null }) {
  if (mission === null)
    return <div className="field text-muted-foreground">-- nothing selected --</div>;
  return (
    <div className="field rhythm">
      <div>
        <h2 className="heading-2">{mission.missionId}</h2>
        <div className="flex flex-wrap gap-[1ch]">
          <Token tone={stateTone(mission.state)}>{mission.state}</Token>
          <Token>{mission.capsuleId}</Token>
        </div>
      </div>
      <p className="whitespace-pre-wrap">{mission.goal}</p>
    </div>
  );
}

function DispatchLog({ transcript }: { readonly transcript: DispatchTranscript | undefined }) {
  if (transcript === undefined) {
    return <div className="dashboard-note text-muted-foreground">-- no dispatch log --</div>;
  }
  return (
    <section className="dashboard-note">
      <p className="eyebrow">dispatch log</p>
      <div className="font-mono space-y-2 mt-[calc(var(--lh)/2)] max-h-[45vh] overflow-auto">
        {transcript.events.length === 0 ? (
          <div className="text-muted-foreground">-- no events --</div>
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
    </section>
  );
}
