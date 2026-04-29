/**
 * Runtime workbench route shell.
 */

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Match } from "effect";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { client } from "@/lib/client";
import type { ResearchPocEvent } from "@/lib/rpc-client";
import { MissionRail, WorkbenchHeader, WorkTreePanel } from "@/workbench/panels";
import { errorMessage, mergeBy, sortMissions } from "@/workbench/projection";
import { missionIdForRoute, routeFromPathname } from "@/workbench/route-state";
import { RouteSheets } from "@/workbench/sheets";
import { type DispatchTranscript, emptyState, type WorkbenchState } from "@/workbench/types";

const defaultGoal = "Ask a research grunt to inspect this repository and report what it is.";

export function MissionListPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const route = useMemo(() => routeFromPathname(pathname), [pathname]);
  const navigate = useNavigate();
  const [goal, setGoal] = useState(defaultGoal);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<WorkbenchState>(emptyState);
  const [initializing, setInitializing] = useState(true);
  const loadRequestId = useRef(0);

  const goHome = useCallback(() => {
    void navigate({ to: "/" });
  }, [navigate]);

  const goMission = useCallback(
    (missionId: string) => {
      void navigate({ to: "/missions/$missionId", params: { missionId } });
    },
    [navigate],
  );

  const inspectMission = useCallback(
    (missionId: string) => {
      void navigate({ to: "/missions/$missionId/inspect", params: { missionId } });
    },
    [navigate],
  );

  const goWorkNode = useCallback(
    (missionId: string, workNodeId: string) => {
      void navigate({
        to: "/missions/$missionId/work/$workNodeId",
        params: { missionId, workNodeId },
      });
    },
    [navigate],
  );

  const closeRoute = useCallback(
    () =>
      Match.value(route).pipe(
        Match.tag("MissionList", goHome),
        Match.tag("Mission", ({ missionId }) => goMission(missionId)),
        Match.tag("MissionInspect", ({ missionId }) => goMission(missionId)),
        Match.tag("WorkNode", ({ missionId }) => goMission(missionId)),
        Match.exhaustive,
      ),
    [goHome, goMission, route],
  );

  const loadWorkbench = useCallback(async (missionId?: string) => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    const isCurrentRequest = () => loadRequestId.current === requestId;
    try {
      const [loadedMissions, allDispatches] = await Promise.all([
        client.listMissions(),
        client.listRuntimeDispatches(100),
      ]);
      if (!isCurrentRequest()) return;
      const missions = sortMissions(loadedMissions);
      if (missionId === undefined) {
        setState({ ...emptyState, missions });
        return;
      }

      const mission = await client.getMission(missionId);
      if (!isCurrentRequest()) return;
      if (mission === null) {
        setState({ ...emptyState, missions });
        return;
      }

      const dispatches = allDispatches.filter((dispatch) => dispatch.missionId === missionId);
      const nodes = await client.getMissionWorkTree(missionId);
      if (!isCurrentRequest()) return;
      const transcripts = await Promise.all(
        dispatches.map(async (dispatch): Promise<DispatchTranscript> => {
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
      setState({ missions, mission, nodes, dispatches, transcripts });
    } catch (cause) {
      if (isCurrentRequest()) setError(errorMessage(cause));
    } finally {
      if (isCurrentRequest()) setInitializing(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkbench(missionIdForRoute(route));
  }, [loadWorkbench, route]);

  const runResearchPoc = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed || running) return;
    setRunning(true);
    setError("");
    loadRequestId.current += 1;
    let runMissionId: string | undefined;
    try {
      await client.startResearchPoc({ goal: trimmed }, (event: ResearchPocEvent) => {
        applyResearchPocEvent(event, setState, goMission);
        runMissionId = event._tag === "MissionCreated" ? event.mission.missionId : runMissionId;
        runMissionId =
          event._tag === "DispatchSessionStarted" ? event.session.missionId : runMissionId;
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      await loadWorkbench(runMissionId ?? missionIdForRoute(route));
      setRunning(false);
    }
  }, [goMission, goal, loadWorkbench, route, running]);

  return (
    <div className="workbench-shell h-full overflow-hidden">
      <div className="workbench-frame h-full flex flex-col gap-[var(--panel-gap)]">
        <WorkbenchHeader
          mission={state.mission}
          running={running}
          goal={goal}
          error={error}
          initializing={initializing}
          onGoalChange={setGoal}
          onRun={runResearchPoc}
        />
        <div className="workbench-route-grid min-h-0 flex-1">
          <MissionRail
            missions={state.missions}
            selectedMissionId={state.mission?.missionId}
            initializing={initializing}
            onSelect={goMission}
          />
          <WorkTreePanel
            mission={state.mission}
            nodes={state.nodes}
            dispatches={state.dispatches}
            route={route}
            initializing={initializing}
            onInspectMission={inspectMission}
            onOpenWorkNode={goWorkNode}
          />
        </div>
        <RouteSheets route={route} state={state} onClose={closeRoute} onOpenWorkNode={goWorkNode} />
      </div>
    </div>
  );
}

const applyResearchPocEvent = (
  event: ResearchPocEvent,
  setState: Dispatch<SetStateAction<WorkbenchState>>,
  goMission: (missionId: string) => void,
) =>
  Match.value(event).pipe(
    Match.tag("MissionCreated", ({ mission }) => {
      goMission(mission.missionId);
      setState((current) => ({
        ...current,
        missions: sortMissions(mergeBy(current.missions, mission, (item) => item.missionId)),
        mission,
      }));
    }),
    Match.tag("WorkNodeStarted", ({ node }) => {
      setState((current) => ({
        ...current,
        nodes: mergeBy(current.nodes, node, (item) => item.workNodeId),
      }));
    }),
    Match.tag("DispatchSessionStarted", ({ session }) => {
      setState((current) => ({
        ...current,
        nodes: mergeBy(current.nodes, session, (node) => node.workNodeId),
        dispatches: mergeBy(current.dispatches, session, (dispatch) => dispatch.dispatchId),
      }));
    }),
    Match.tag("DispatchEvent", ({ dispatchId, event }) => {
      setState((current) => ({
        ...current,
        transcripts: mergeBy(
          current.transcripts,
          {
            dispatchId,
            name: event.name ?? dispatchId,
            events: [
              ...(current.transcripts.find((transcript) => transcript.dispatchId === dispatchId)
                ?.events ?? []),
              { dispatchId, timestamp: Date.now(), event },
            ],
          },
          (transcript) => transcript.dispatchId,
        ),
      }));
    }),
    Match.exhaustive,
  );
