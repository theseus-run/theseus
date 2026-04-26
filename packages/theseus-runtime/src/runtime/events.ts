import type * as Dispatch from "@theseus.run/core/Dispatch";
import type { DispatchSession, RuntimeDispatchEvent } from "./types.ts";

export const RuntimeEvents = {
  dispatchSessionStarted: (session: DispatchSession): RuntimeDispatchEvent => ({
    _tag: "DispatchSessionStarted",
    session,
  }),

  dispatchObserved: (
    session: Pick<DispatchSession, "dispatchId" | "missionId" | "capsuleId">,
    event: Dispatch.DispatchEvent,
  ): RuntimeDispatchEvent => ({
    _tag: "DispatchEvent",
    dispatchId: session.dispatchId,
    missionId: session.missionId,
    capsuleId: session.capsuleId,
    event,
  }),
};
