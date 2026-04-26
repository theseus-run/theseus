import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type { MissionSessionState } from "../../types.ts";

export const CapsuleSink = {
  missionTransition: (
    capsule: CapsuleNs.CapsuleRecord,
    from: MissionSessionState,
    to: MissionSessionState,
  ) =>
    capsule.log({
      type: "mission.transition",
      by: "runtime",
      data: { from, to },
    }),

  dispatchStart: (
    capsule: CapsuleNs.CapsuleRecord,
    input: {
      readonly task: string;
      readonly name: string;
      readonly continueFrom: string | undefined;
      readonly dispatchId: string;
      readonly missionId: string;
    },
  ) =>
    capsule.log({
      type: "dispatch.start",
      by: "runtime",
      data: input,
    }),

  dispatchDone: (
    capsule: CapsuleNs.CapsuleRecord,
    input: { readonly dispatchId: string; readonly result: Dispatch.DispatchOutput },
  ) =>
    capsule.log({
      type: "dispatch.done",
      by: "runtime",
      data: { dispatchId: input.dispatchId, content: input.result.content },
    }),

  dispatchFailed: (
    capsule: CapsuleNs.CapsuleRecord,
    input: { readonly dispatchId: string; readonly reason: string },
  ) =>
    capsule.log({
      type: "dispatch.failed",
      by: "runtime",
      data: input,
    }),
};
