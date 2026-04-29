import { Match } from "effect";
import { SheetStack } from "@/components/ui/sheet";
import { MissionSheet } from "./mission-detail";
import type { WorkbenchRoute } from "./route-state";
import { WorkbenchSheet } from "./sheet-stack";
import type { WorkbenchState } from "./types";
import { WorkNodeSheet } from "./work-node-detail";

export function RouteSheets({
  route,
  state,
  onClose,
  onOpenWorkNode,
}: {
  readonly route: WorkbenchRoute;
  readonly state: WorkbenchState;
  readonly onClose: () => void;
  readonly onOpenWorkNode: (missionId: string, workNodeId: string) => void;
}) {
  const sheets = Match.value(route).pipe(
    Match.tag("MissionList", () => null),
    Match.tag("Mission", () => null),
    Match.tag("MissionInspect", () => (
      <WorkbenchSheet
        key={`mission:${state.mission?.missionId ?? "missing"}`}
        open
        onClose={onClose}
      >
        <MissionSheet
          mission={state.mission}
          nodes={state.nodes}
          dispatches={state.dispatches}
          onOpenWorkNode={onOpenWorkNode}
        />
      </WorkbenchSheet>
    )),
    Match.tag("WorkNode", (target) => (
      <WorkbenchSheet key={`work:${target.workNodeId}`} open onClose={onClose}>
        <WorkNodeSheet
          mission={state.mission}
          node={state.nodes.find((node) => node.workNodeId === target.workNodeId)}
          nodes={state.nodes}
          dispatches={state.dispatches}
          transcripts={state.transcripts}
          onOpenWorkNode={onOpenWorkNode}
        />
      </WorkbenchSheet>
    )),
    Match.exhaustive,
  );

  return sheets === null ? null : <SheetStack>{sheets}</SheetStack>;
}
