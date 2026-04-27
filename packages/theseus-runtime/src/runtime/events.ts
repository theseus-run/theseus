import type * as Dispatch from "@theseus.run/core/Dispatch";
import type { DispatchSession, RuntimeDispatchEvent, WorkNodeSession } from "./types.ts";

export const RuntimeEvents = {
  workNodeStarted: (node: WorkNodeSession): RuntimeDispatchEvent => ({
    _tag: "WorkNodeStarted",
    node,
  }),

  dispatchSessionStarted: (session: DispatchSession): RuntimeDispatchEvent => ({
    _tag: "DispatchSessionStarted",
    session,
  }),

  dispatchObserved: (
    session: Pick<DispatchSession, "workNodeId" | "dispatchId" | "missionId" | "capsuleId">,
    event: Dispatch.DispatchEvent,
  ): RuntimeDispatchEvent => ({
    _tag: "DispatchEvent",
    workNodeId: session.workNodeId,
    dispatchId: session.dispatchId,
    missionId: session.missionId,
    capsuleId: session.capsuleId,
    event,
  }),
};
