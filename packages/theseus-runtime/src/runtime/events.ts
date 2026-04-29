import type * as Dispatch from "@theseus.run/core/Dispatch";
import type {
  DispatchSession,
  RuntimeDispatchEvent,
  WorkNodeSession,
  WorkNodeState,
} from "./types.ts";

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

  workNodeStateChanged: (
    session: Pick<WorkNodeSession, "workNodeId" | "missionId">,
    state: WorkNodeState,
    reason?: string,
  ): RuntimeDispatchEvent => ({
    _tag: "WorkNodeStateChanged",
    workNodeId: session.workNodeId,
    missionId: session.missionId,
    state,
    ...(reason !== undefined ? { reason } : {}),
  }),

  runtimeProcessFailed: (
    session: Pick<WorkNodeSession, "workNodeId" | "missionId">,
    process: string,
    reason: string,
  ): RuntimeDispatchEvent => ({
    _tag: "RuntimeProcessFailed",
    workNodeId: session.workNodeId,
    missionId: session.missionId,
    process,
    reason,
  }),
};
