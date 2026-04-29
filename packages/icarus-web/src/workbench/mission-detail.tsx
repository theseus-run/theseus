import { SheetBody, SheetHeader, SheetMeta, SheetSection, SheetTitle } from "@/components/ui/sheet";
import { StackList, StackRow } from "@/components/ui/stack-list";
import { StatCell, StatGrid } from "@/components/ui/stat-grid";
import { Token } from "@/components/ui/token";
import type { DispatchSession, MissionSession, WorkNodeSession } from "@/lib/rpc-client";
import { MissingSheet } from "./missing-sheet";
import { modelLabel, stateTone } from "./projection";

export function MissionSheet({
  mission,
  nodes,
  dispatches,
  onOpenWorkNode,
}: {
  readonly mission: MissionSession | null;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}) {
  if (mission === null) return <MissingSheet title="Mission" />;

  const summary = missionSummary(nodes);
  const rootNodes = nodes.filter((node) => node.parentWorkNodeId == null);

  return (
    <>
      <SheetHeader>
        <div>
          <SheetTitle>Mission</SheetTitle>
          <SheetMeta>
            <Token tone={stateTone(mission.state)}>{mission.state}</Token>
            <Token>
              {summary.done}/{summary.total} done
            </Token>
            {summary.failed > 0 && <Token tone="danger">{summary.failed} failed</Token>}
          </SheetMeta>
        </div>
      </SheetHeader>
      <SheetBody>
        <SheetSection>
          <p className="eyebrow">overview</p>
          <StatGrid>
            <StatCell label="progress" value={`${summary.done}/${summary.total}`} />
            <StatCell label="active" value={`${summary.active}`} tone="process" />
            <StatCell label="delegated" value={`${summary.delegated}`} />
            <StatCell label="failures" value={`${summary.failed}`} tone={failureTone(summary)} />
          </StatGrid>
        </SheetSection>
        <SheetSection>
          <p className="eyebrow">goal</p>
          <p>{mission.goal}</p>
        </SheetSection>
        <SheetSection>
          <p className="eyebrow">root work</p>
          <StackList>
            {rootNodes.length === 0 ? (
              <div className="text-muted-foreground">-- no root work --</div>
            ) : (
              rootNodes.map((node) => (
                <RootWorkRow
                  key={node.workNodeId}
                  missionId={mission.missionId}
                  node={node}
                  dispatch={dispatches.find(
                    (candidate) => candidate.workNodeId === node.workNodeId,
                  )}
                  onOpenWorkNode={onOpenWorkNode}
                />
              ))
            )}
          </StackList>
        </SheetSection>
      </SheetBody>
    </>
  );
}

function RootWorkRow({
  missionId,
  node,
  dispatch,
  onOpenWorkNode,
}: {
  readonly missionId: string;
  readonly node: WorkNodeSession;
  readonly dispatch: DispatchSession | undefined;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}) {
  return (
    <StackRow
      title={node.label}
      summary={node.kind}
      meta={node.state}
      tags={
        <>
          <Token variant="plain">{node.relation}</Token>
          {dispatch !== undefined && <Token variant="plain">{modelLabel(dispatch)}</Token>}
        </>
      }
      onClick={() => onOpenWorkNode(missionId, node.workNodeId)}
    />
  );
}

function missionSummary(nodes: ReadonlyArray<WorkNodeSession>) {
  const done = nodes.filter((node) => node.state === "done").length;
  const failed = nodes.filter((node) => node.state === "failed" || node.state === "aborted").length;
  const active = nodes.filter(
    (node) => node.state === "pending" || node.state === "running" || node.state === "blocked",
  ).length;
  const delegated = nodes.filter((node) => node.relation === "delegated").length;
  return {
    total: nodes.length,
    done,
    failed,
    active,
    delegated,
  };
}

function failureTone(summary: ReturnType<typeof missionSummary>): "danger" | "muted" {
  return summary.failed > 0 ? "danger" : "muted";
}
