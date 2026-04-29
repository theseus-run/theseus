import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { StackList, StackRow } from "@/components/ui/stack-list";
import { Token } from "@/components/ui/token";
import { type TreeNodeModel, TreeView } from "@/components/ui/tree-view";
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
        <div className="workbench-stats">
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
          <StackList>
            {missions.length === 0 ? (
              <div className="field text-muted-foreground">
                {initializing ? "-- loading missions --" : "-- no missions --"}
              </div>
            ) : (
              missions.map((mission) => (
                <StackRow
                  key={mission.missionId}
                  marker={stateSymbol(mission.state)}
                  title={mission.goal}
                  summary={mission.missionId}
                  meta={mission.state}
                  selected={selectedMissionId === mission.missionId}
                  tags={
                    <Token variant="plain" tone={stateTone(mission.state)}>
                      capsule {mission.capsuleId}
                    </Token>
                  }
                  onClick={() => onSelect(mission.missionId)}
                />
              ))
            )}
          </StackList>
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
  onInspectMission,
  onOpenWorkNode,
}: {
  readonly mission: MissionSession | null;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly route: WorkbenchRoute;
  readonly initializing: boolean;
  readonly onInspectMission: (missionId: string) => void;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}) {
  const treeNodes =
    mission === null
      ? []
      : [
          missionTreeNode({
            mission,
            nodes,
            dispatches,
            route,
            onInspectMission,
            onOpenWorkNode,
          }),
        ];
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
              <TreeView nodes={treeNodes} />
            </div>
          )}
        </PanelBody>
      </Panel>
    </main>
  );
}

function missionTreeNode({
  mission,
  nodes,
  dispatches,
  route,
  onInspectMission,
  onOpenWorkNode,
}: {
  readonly mission: MissionSession;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly route: WorkbenchRoute;
  readonly onInspectMission: (missionId: string) => void;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}): TreeNodeModel {
  return {
    id: mission.missionId,
    marker: stateSymbol(mission.state),
    title: "Mission",
    summary: mission.goal,
    meta: mission.state,
    selected: route._tag === "Mission" || route._tag === "MissionInspect",
    tags: (
      <Token variant="plain" tone={stateTone(mission.state)}>
        capsule {mission.capsuleId}
      </Token>
    ),
    onClick: () => onInspectMission(mission.missionId),
    children: nodes
      .filter((node) => node.parentWorkNodeId == null)
      .map((node) =>
        workTreeNode({
          missionId: mission.missionId,
          node,
          nodes,
          dispatches,
          route,
          onOpenWorkNode,
        }),
      ),
  };
}

function workTreeNode({
  missionId,
  node,
  nodes,
  dispatches,
  route,
  onOpenWorkNode,
}: {
  readonly missionId: string;
  readonly node: WorkNodeSession;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly route: WorkbenchRoute;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}): TreeNodeModel {
  const dispatch = dispatchForNode(node, dispatches);
  const active = route._tag === "WorkNode" && route.workNodeId === node.workNodeId;
  return {
    id: node.workNodeId,
    marker: stateSymbol(node.state),
    title: node.label,
    summary: node.kind,
    meta: node.state,
    selected: active,
    tags: (
      <>
        <Token variant="plain">{node.relation}</Token>
        {dispatch && <Token variant="plain">{modelLabel(dispatch)}</Token>}
      </>
    ),
    onClick: () => onOpenWorkNode(missionId, node.workNodeId),
    children: nodes
      .filter((candidate) => candidate.parentWorkNodeId === node.workNodeId)
      .map((child) =>
        workTreeNode({
          missionId,
          node: child,
          nodes,
          dispatches,
          route,
          onOpenWorkNode,
        }),
      ),
  };
}
