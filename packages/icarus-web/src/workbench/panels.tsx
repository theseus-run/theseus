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
import type { DispatchSession, MissionSession, WorkNodeSession } from "@/lib/rpc-client";
import { dispatchForNode, modelLabel, stateSymbol, stateTone } from "./projection";
import type { WorkbenchRoute } from "./route-state";

export function WorkbenchHeader({
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
          <h1 className="heading-1">Mission tree.</h1>
          <p className="lede">Route-backed topology with sheet inspection for runtime work.</p>
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

export function MissionRail({
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

export function WorkTreePanel({
  mission,
  nodes,
  dispatches,
  route,
  initializing,
  onOpenMission,
  onOpenWorkNode,
  onOpenDispatch,
}: {
  readonly mission: MissionSession | null;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly route: WorkbenchRoute;
  readonly initializing: boolean;
  readonly onOpenMission: (missionId: string) => void;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
  readonly onOpenDispatch: (missionId: string, dispatchId: string) => void;
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
              {initializing ? "-- loading work tree --" : "-- select a mission --"}
            </div>
          ) : (
            <div className="field">
              <button
                type="button"
                className={[
                  "workbench-tree-node",
                  route._tag === "Mission" ? "workbench-tree-node-active" : "",
                ].join(" ")}
                onClick={() => onOpenMission(mission.missionId)}
              >
                <span>Mission</span>
                <Token variant="plain" tone={stateTone(mission.state)}>
                  {mission.state}
                </Token>
              </button>
              <div className="mt-[calc(var(--lh)/2)]">
                {roots.map((node) => (
                  <WorkTreeNode
                    key={node.workNodeId}
                    missionId={mission.missionId}
                    node={node}
                    nodes={nodes}
                    dispatches={dispatches}
                    route={route}
                    depth={1}
                    onOpenWorkNode={onOpenWorkNode}
                    onOpenDispatch={onOpenDispatch}
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
  missionId,
  node,
  nodes,
  dispatches,
  route,
  depth,
  onOpenWorkNode,
  onOpenDispatch,
}: {
  readonly missionId: string;
  readonly node: WorkNodeSession;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly route: WorkbenchRoute;
  readonly depth: number;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
  readonly onOpenDispatch: (missionId: string, dispatchId: string) => void;
}) {
  const children = nodes.filter((candidate) => candidate.parentWorkNodeId === node.workNodeId);
  const dispatch = dispatchForNode(node, dispatches);
  const active =
    route._tag === "WorkNode"
      ? route.workNodeId === node.workNodeId
      : route._tag !== "MissionList" &&
        route._tag !== "Mission" &&
        dispatch?.dispatchId === route.dispatchId;
  const open = () =>
    dispatch === undefined
      ? onOpenWorkNode(missionId, node.workNodeId)
      : onOpenDispatch(missionId, dispatch.dispatchId);
  return (
    <div className="workbench-tree-branch" style={{ marginLeft: `${depth * 2}ch` }}>
      <button
        type="button"
        className={["workbench-tree-node", active ? "workbench-tree-node-active" : ""].join(" ")}
        onClick={open}
      >
        <span>{node.label}</span>
        <span className="flex flex-wrap gap-[1ch]">
          <Token variant="plain">{node.relation}</Token>
          <Token variant="plain" tone={stateTone(node.state)}>
            {node.state}
          </Token>
          {dispatch && <Token variant="plain">{modelLabel(dispatch)}</Token>}
        </span>
      </button>
      {children.map((child) => (
        <WorkTreeNode
          key={child.workNodeId}
          missionId={missionId}
          node={child}
          nodes={nodes}
          dispatches={dispatches}
          route={route}
          depth={depth + 1}
          onOpenWorkNode={onOpenWorkNode}
          onOpenDispatch={onOpenDispatch}
        />
      ))}
    </div>
  );
}
