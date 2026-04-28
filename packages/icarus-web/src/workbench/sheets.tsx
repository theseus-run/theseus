import { Match } from "effect";
import { SheetStack } from "@/components/ui/sheet";
import { CortexFrameSheet, CortexSignalSheet } from "./cortex-detail";
import { DispatchSheet } from "./dispatch-detail";
import { EventSheet } from "./event-detail";
import { cortexEventsFromTranscript, transcriptForDispatch } from "./projection";
import type { WorkbenchRoute } from "./route-state";
import { WorkbenchSheet } from "./sheet-stack";
import type { WorkbenchState } from "./types";
import { WorkNodeSheet } from "./work-node-detail";

export function RouteSheets({
  route,
  state,
  onClose,
  onOpenMission,
  onOpenDispatch,
  onOpenEvent,
  onOpenCortex,
  onOpenSignal,
}: {
  readonly route: WorkbenchRoute;
  readonly state: WorkbenchState;
  readonly onClose: () => void;
  readonly onOpenMission: (missionId: string) => void;
  readonly onOpenDispatch: (missionId: string, dispatchId: string) => void;
  readonly onOpenEvent: (missionId: string, dispatchId: string, eventIndex: number) => void;
  readonly onOpenCortex: (missionId: string, dispatchId: string, iteration: number) => void;
  readonly onOpenSignal: (
    missionId: string,
    dispatchId: string,
    iteration: number,
    signalId: string,
  ) => void;
}) {
  const dispatchSheet = (target: { readonly missionId: string; readonly dispatchId: string }) => (
    <WorkbenchSheet key="dispatch" open depth={0} onClose={() => onOpenMission(target.missionId)}>
      <DispatchSheet
        missionId={target.missionId}
        dispatch={state.dispatches.find((dispatch) => dispatch.dispatchId === target.dispatchId)}
        transcript={transcriptForDispatch(target.dispatchId, state.transcripts)}
        onOpenEvent={onOpenEvent}
        onOpenCortex={onOpenCortex}
      />
    </WorkbenchSheet>
  );

  const eventSheet = (target: Extract<WorkbenchRoute, { readonly _tag: "DispatchEvent" }>) => (
    <WorkbenchSheet
      key="event"
      open
      depth={1}
      onClose={() => onOpenDispatch(target.missionId, target.dispatchId)}
    >
      <EventSheet
        target={target}
        entry={
          transcriptForDispatch(target.dispatchId, state.transcripts)?.events[target.eventIndex]
        }
        onOpenDispatch={onOpenDispatch}
        onOpenCortex={onOpenCortex}
      />
    </WorkbenchSheet>
  );

  const cortexSheet = (target: {
    readonly missionId: string;
    readonly dispatchId: string;
    readonly iteration: number;
  }) => (
    <WorkbenchSheet
      key="cortex"
      open
      depth={1}
      onClose={() => onOpenDispatch(target.missionId, target.dispatchId)}
    >
      <CortexFrameSheet
        target={target}
        entry={cortexEventsFromTranscript(
          transcriptForDispatch(target.dispatchId, state.transcripts),
        ).find((entry) => entry.event.iteration === target.iteration)}
        onOpenSignal={onOpenSignal}
      />
    </WorkbenchSheet>
  );

  const signalSheet = (target: Extract<WorkbenchRoute, { readonly _tag: "CortexSignal" }>) => (
    <WorkbenchSheet
      key="signal"
      open
      depth={2}
      onClose={() => onOpenCortex(target.missionId, target.dispatchId, target.iteration)}
    >
      <CortexSignalSheet
        target={target}
        signal={cortexEventsFromTranscript(
          transcriptForDispatch(target.dispatchId, state.transcripts),
        )
          .find((entry) => entry.event.iteration === target.iteration)
          ?.event.signals?.find((signal) => signal.id === target.signalId)}
      />
    </WorkbenchSheet>
  );

  const sheets = Match.value(route).pipe(
    Match.tag("MissionList", () => null),
    Match.tag("Mission", () => null),
    Match.tag("WorkNode", (target) => (
      <WorkbenchSheet open onClose={onClose}>
        <WorkNodeSheet
          node={state.nodes.find((node) => node.workNodeId === target.workNodeId)}
          dispatches={state.dispatches}
        />
      </WorkbenchSheet>
    )),
    Match.tag("Dispatch", (target) => <>{dispatchSheet(target)}</>),
    Match.tag("DispatchEvent", (target) => (
      <>
        {dispatchSheet(target)}
        {eventSheet(target)}
      </>
    )),
    Match.tag("CortexFrame", (target) => (
      <>
        {dispatchSheet(target)}
        {cortexSheet(target)}
      </>
    )),
    Match.tag("CortexSignal", (target) => (
      <>
        {dispatchSheet(target)}
        {cortexSheet(target)}
        {signalSheet(target)}
      </>
    )),
    Match.exhaustive,
  );

  return sheets === null ? null : <SheetStack>{sheets}</SheetStack>;
}
