import type {
  DispatchEventEntry,
  DispatchSession,
  MissionSession,
  WorkNodeSession,
} from "@/lib/rpc-client";

export interface ReportPacket {
  readonly _tag: "Reported" | "Unstructured";
  readonly target: string;
  readonly dispatchId: string;
  readonly report?: {
    readonly summary: string;
    readonly content: string;
  };
  readonly salvage?: {
    readonly summary: string;
    readonly content: string;
  };
}

export interface DispatchTranscript {
  readonly dispatchId: string;
  readonly name: string;
  readonly events: ReadonlyArray<DispatchEventEntry>;
}

export interface WorkbenchState {
  readonly missions: ReadonlyArray<MissionSession>;
  readonly mission: MissionSession | null;
  readonly nodes: ReadonlyArray<WorkNodeSession>;
  readonly dispatches: ReadonlyArray<DispatchSession>;
  readonly transcripts: ReadonlyArray<DispatchTranscript>;
}

export const emptyState: WorkbenchState = {
  missions: [],
  mission: null,
  nodes: [],
  dispatches: [],
  transcripts: [],
};
