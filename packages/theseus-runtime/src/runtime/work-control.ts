import { Match } from "effect";
import type {
  WorkControlCapability,
  WorkControlCommand,
  WorkNodeControlDescriptor,
  WorkNodeKind,
  WorkNodeState,
} from "./types.ts";

export const WorkControlCapabilities = {
  supported: (): WorkControlCapability => ({ _tag: "Supported" }),
  unsupported: (reason: string): WorkControlCapability => ({ _tag: "Unsupported", reason }),
};

const unsupportedByNodeKind = (kind: WorkNodeKind): WorkControlCapability =>
  WorkControlCapabilities.unsupported(`${kind} nodes do not support this control`);

export const WorkControlDescriptors = {
  unsupported: (kind: WorkNodeKind): WorkNodeControlDescriptor => ({
    interrupt: unsupportedByNodeKind(kind),
    injectGuidance: unsupportedByNodeKind(kind),
    pause: unsupportedByNodeKind(kind),
    resume: unsupportedByNodeKind(kind),
    requestStatus: unsupportedByNodeKind(kind),
  }),

  dispatch: (state: WorkNodeState): WorkNodeControlDescriptor => {
    const inactive = WorkControlCapabilities.unsupported("dispatch is not active");
    const unsupportedPause = WorkControlCapabilities.unsupported(
      "dispatch pause is not implemented",
    );
    const unsupportedResume = WorkControlCapabilities.unsupported(
      "dispatch resume is not implemented",
    );
    return state === "running"
      ? {
          interrupt: WorkControlCapabilities.supported(),
          injectGuidance: WorkControlCapabilities.supported(),
          pause: unsupportedPause,
          resume: unsupportedResume,
          requestStatus: WorkControlCapabilities.supported(),
        }
      : {
          interrupt: inactive,
          injectGuidance: inactive,
          pause: unsupportedPause,
          resume: unsupportedResume,
          requestStatus: WorkControlCapabilities.supported(),
        };
  },
};

export const capabilityForCommand = (
  descriptor: WorkNodeControlDescriptor,
  command: WorkControlCommand,
): WorkControlCapability =>
  Match.value(command).pipe(
    Match.tag("Interrupt", () => descriptor.interrupt),
    Match.tag("InjectGuidance", () => descriptor.injectGuidance),
    Match.tag("Pause", () => descriptor.pause),
    Match.tag("Resume", () => descriptor.resume),
    Match.tag("RequestStatus", () => descriptor.requestStatus),
    Match.exhaustive,
  );
