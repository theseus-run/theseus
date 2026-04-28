import { Match } from "effect";

export type WorkbenchRoute =
  | { readonly _tag: "MissionList" }
  | { readonly _tag: "Mission"; readonly missionId: string }
  | { readonly _tag: "WorkNode"; readonly missionId: string; readonly workNodeId: string }
  | { readonly _tag: "Dispatch"; readonly missionId: string; readonly dispatchId: string }
  | {
      readonly _tag: "DispatchEvent";
      readonly missionId: string;
      readonly dispatchId: string;
      readonly eventIndex: number;
    }
  | {
      readonly _tag: "CortexFrame";
      readonly missionId: string;
      readonly dispatchId: string;
      readonly iteration: number;
    }
  | {
      readonly _tag: "CortexSignal";
      readonly missionId: string;
      readonly dispatchId: string;
      readonly iteration: number;
      readonly signalId: string;
    };

export const WorkbenchRoutes = {
  missionList: (): WorkbenchRoute => ({ _tag: "MissionList" }),
  mission: (missionId: string): WorkbenchRoute => ({ _tag: "Mission", missionId }),
  workNode: (missionId: string, workNodeId: string): WorkbenchRoute => ({
    _tag: "WorkNode",
    missionId,
    workNodeId,
  }),
  dispatch: (missionId: string, dispatchId: string): WorkbenchRoute => ({
    _tag: "Dispatch",
    missionId,
    dispatchId,
  }),
  dispatchEvent: (missionId: string, dispatchId: string, eventIndex: number): WorkbenchRoute => ({
    _tag: "DispatchEvent",
    missionId,
    dispatchId,
    eventIndex,
  }),
  cortexFrame: (missionId: string, dispatchId: string, iteration: number): WorkbenchRoute => ({
    _tag: "CortexFrame",
    missionId,
    dispatchId,
    iteration,
  }),
  cortexSignal: (
    missionId: string,
    dispatchId: string,
    iteration: number,
    signalId: string,
  ): WorkbenchRoute => ({
    _tag: "CortexSignal",
    missionId,
    dispatchId,
    iteration,
    signalId,
  }),
};

const numberSegment = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const routeFromPathname = (pathname: string): WorkbenchRoute => {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [root, missionId, section, dispatchOrWorkId, subsection, value, nested, nestedValue] =
    segments;
  if (segments.length === 0) return WorkbenchRoutes.missionList();
  if (root !== "missions" || missionId === undefined) return WorkbenchRoutes.missionList();
  if (segments.length === 2) return WorkbenchRoutes.mission(missionId);
  if (section === "work" && dispatchOrWorkId !== undefined) {
    return WorkbenchRoutes.workNode(missionId, dispatchOrWorkId);
  }
  if (section !== "dispatches" || dispatchOrWorkId === undefined) {
    return WorkbenchRoutes.mission(missionId);
  }
  if (subsection === undefined) return WorkbenchRoutes.dispatch(missionId, dispatchOrWorkId);
  if (subsection === "events") {
    const eventIndex = numberSegment(value);
    return eventIndex === undefined
      ? WorkbenchRoutes.dispatch(missionId, dispatchOrWorkId)
      : WorkbenchRoutes.dispatchEvent(missionId, dispatchOrWorkId, eventIndex);
  }
  if (subsection === "cortex") {
    const iteration = numberSegment(value);
    if (iteration === undefined) return WorkbenchRoutes.dispatch(missionId, dispatchOrWorkId);
    return nested === "signals" && nestedValue !== undefined
      ? WorkbenchRoutes.cortexSignal(missionId, dispatchOrWorkId, iteration, nestedValue)
      : WorkbenchRoutes.cortexFrame(missionId, dispatchOrWorkId, iteration);
  }
  return WorkbenchRoutes.dispatch(missionId, dispatchOrWorkId);
};

export const missionIdForRoute = (route: WorkbenchRoute): string | undefined =>
  Match.value(route).pipe(
    Match.tag("MissionList", () => undefined),
    Match.orElse((value) => value.missionId),
  );
