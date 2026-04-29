import { Match } from "effect";

export type WorkbenchRoute =
  | { readonly _tag: "MissionList" }
  | { readonly _tag: "Mission"; readonly missionId: string }
  | { readonly _tag: "MissionInspect"; readonly missionId: string }
  | { readonly _tag: "WorkNode"; readonly missionId: string; readonly workNodeId: string };

export const WorkbenchRoutes = {
  missionList: (): WorkbenchRoute => ({ _tag: "MissionList" }),
  mission: (missionId: string): WorkbenchRoute => ({ _tag: "Mission", missionId }),
  missionInspect: (missionId: string): WorkbenchRoute => ({ _tag: "MissionInspect", missionId }),
  workNode: (missionId: string, workNodeId: string): WorkbenchRoute => ({
    _tag: "WorkNode",
    missionId,
    workNodeId,
  }),
};

export const routeFromPathname = (pathname: string): WorkbenchRoute => {
  const [root, missionId, section, workNodeId] = pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return WorkbenchRoutes.missionList();
  if (root !== "missions" || missionId === undefined) return WorkbenchRoutes.missionList();
  if (segments.length === 2) return WorkbenchRoutes.mission(missionId);
  if (section === "inspect") return WorkbenchRoutes.missionInspect(missionId);
  if (section === "work" && workNodeId !== undefined) {
    return WorkbenchRoutes.workNode(missionId, workNodeId);
  }
  return WorkbenchRoutes.mission(missionId);
};

export const missionIdForRoute = (route: WorkbenchRoute): string | undefined =>
  Match.value(route).pipe(
    Match.tag("MissionList", () => undefined),
    Match.orElse((value) => value.missionId),
  );
