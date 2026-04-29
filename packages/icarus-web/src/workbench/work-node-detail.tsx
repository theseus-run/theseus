import { PayloadView } from "@/components/ui/payload-view";
import { SheetBody, SheetHeader, SheetMeta, SheetSection, SheetTitle } from "@/components/ui/sheet";
import { StackList, StackRow } from "@/components/ui/stack-list";
import { Token } from "@/components/ui/token";
import type { DispatchEventEntry, DispatchSession, WorkNodeSession } from "@/lib/rpc-client";
import { MissingSheet } from "./missing-sheet";
import {
  dispatchForNode,
  eventLine,
  eventMarker,
  eventTitle,
  finalTextFromEvents,
  modelLabel,
  reportFromEvents,
  stateTone,
} from "./projection";
import type { DispatchTranscript, WorkbenchState } from "./types";

export function WorkNodeSheet({
  mission,
  node,
  nodes,
  dispatches,
  transcripts,
  onOpenWorkNode,
}: {
  readonly mission: WorkbenchState["mission"];
  readonly node: WorkNodeSession | undefined;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly transcripts: ReadonlyArray<DispatchTranscript>;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}) {
  if (node === undefined) return <MissingSheet title="Work Node" />;

  const dispatch = dispatchForNode(node, dispatches);
  const transcript = transcripts.find((candidate) => candidate.dispatchId === dispatch?.dispatchId);
  const events = transcript?.events ?? [];
  const report = reportFromEvents(events);
  const final = finalTextFromEvents(events);
  const failure = failureFromEvents(events);
  const parent = nodes.find((candidate) => candidate.workNodeId === node.parentWorkNodeId);
  const childNodes = nodes.filter((candidate) => candidate.parentWorkNodeId === node.workNodeId);

  return (
    <>
      <SheetHeader>
        <div>
          <SheetTitle>{node.label}</SheetTitle>
          <SheetMeta>
            <Token>{node.kind}</Token>
            <Token>{node.relation}</Token>
            <Token tone={stateTone(node.state)}>{node.state}</Token>
            {dispatch !== undefined && <Token>{modelLabel(dispatch)}</Token>}
          </SheetMeta>
        </div>
      </SheetHeader>
      <SheetBody>
        <WorkNodeResult state={node.state} final={final} report={report} failure={failure} />
        <WorkNodeActivity events={events} />
        <WorkNodeContext
          missionId={mission?.missionId ?? node.missionId}
          capsuleId={mission?.capsuleId ?? node.capsuleId}
          parent={parent}
          childNodes={childNodes}
          dispatch={dispatch}
          onOpenWorkNode={onOpenWorkNode}
        />
        <WorkNodeDebug node={node} dispatch={dispatch} eventCount={events.length} />
      </SheetBody>
    </>
  );
}

function WorkNodeResult({
  state,
  final,
  report,
  failure,
}: {
  readonly state: WorkNodeSession["state"];
  readonly final: string | undefined;
  readonly report: ReturnType<typeof reportFromEvents>;
  readonly failure: string | undefined;
}) {
  return (
    <SheetSection>
      <p className="eyebrow">result</p>
      <div className="grid gap-[calc(var(--lh)/2)]">
        {failure !== undefined && <PayloadView value={failure} format="markdown" />}
        {final !== undefined && <PayloadView value={final} format="markdown" />}
        {report !== undefined && (
          <div className="grid gap-[calc(var(--lh)/2)]">
            <StackRow
              title={report._tag === "Reported" ? "structured report" : "salvaged report"}
              summary={
                report._tag === "Reported" ? report.report?.summary : report.salvage?.summary
              }
              meta={report.target}
            />
            <PayloadView
              value={report._tag === "Reported" ? report.report?.content : report.salvage?.content}
              format="markdown"
            />
          </div>
        )}
        {failure === undefined && final === undefined && report === undefined && (
          <div className="text-muted-foreground">-- {state} --</div>
        )}
      </div>
    </SheetSection>
  );
}

function WorkNodeActivity({ events }: { readonly events: ReadonlyArray<DispatchEventEntry> }) {
  return (
    <SheetSection>
      <p className="eyebrow">activity</p>
      <StackList className="runtime-transcript">
        {events.length === 0 ? (
          <div className="text-muted-foreground">-- no events --</div>
        ) : (
          events.map((entry) => (
            <StackRow
              key={`${entry.timestamp}:${entry.dispatchId}:${entry.event._tag}:${eventLine(entry.event).slice(0, 80)}`}
              className={`runtime-transcript-row row-${entry.event._tag}`}
              marker={eventMarker(entry.event)}
              title={eventTitle(entry.event)}
              summary={<ActivitySummary entry={entry} />}
            />
          ))
        )}
      </StackList>
    </SheetSection>
  );
}

function ActivitySummary({ entry }: { readonly entry: DispatchEventEntry }) {
  if (entry.event._tag === "Text") {
    return <PayloadView value={entry.event.content ?? ""} format="markdown" surface="inline" />;
  }
  return eventLine(entry.event);
}

function WorkNodeContext({
  missionId,
  capsuleId,
  parent,
  childNodes,
  dispatch,
  onOpenWorkNode,
}: {
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parent: WorkNodeSession | undefined;
  readonly childNodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatch: DispatchSession | undefined;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}) {
  return (
    <SheetSection>
      <p className="eyebrow">context</p>
      <StackList>
        <StackRow title="mission" summary={missionId} meta={capsuleId} />
        {dispatch !== undefined && (
          <StackRow
            title={dispatch.name}
            summary={dispatch.dispatchId}
            meta={modelLabel(dispatch)}
            tags={
              <>
                <Token variant="plain">iteration {dispatch.iteration}</Token>
                <Token variant="plain">
                  usage {dispatch.usage.inputTokens}/{dispatch.usage.outputTokens}
                </Token>
              </>
            }
          />
        )}
        {parent !== undefined && (
          <StackRow
            title={parent.label}
            summary={parent.workNodeId}
            meta={parent.state}
            onClick={() => onOpenWorkNode(missionId, parent.workNodeId)}
          />
        )}
        {childNodes.map((child) => (
          <StackRow
            key={child.workNodeId}
            title={child.label}
            summary={child.workNodeId}
            meta={child.state}
            onClick={() => onOpenWorkNode(missionId, child.workNodeId)}
          />
        ))}
      </StackList>
    </SheetSection>
  );
}

function WorkNodeDebug({
  node,
  dispatch,
  eventCount,
}: {
  readonly node: WorkNodeSession;
  readonly dispatch: DispatchSession | undefined;
  readonly eventCount: number;
}) {
  return (
    <SheetSection>
      <details>
        <summary className="cursor-pointer text-muted-foreground">debug</summary>
        <div className="mt-[calc(var(--lh)/2)] grid gap-[calc(var(--lh)/2)]">
          <StackRow title="events" summary={`${eventCount}`} />
          <PayloadView value={{ node, dispatch }} format="json" />
        </div>
      </details>
    </SheetSection>
  );
}

function failureFromEvents(events: ReadonlyArray<DispatchEventEntry>): string | undefined {
  return [...events].reverse().find((entry) => entry.event._tag === "Failed")?.event.reason;
}
