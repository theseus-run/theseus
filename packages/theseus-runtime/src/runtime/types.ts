import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Data, type Effect, type Stream } from "effect";
import type { SerializedDispatchSpec } from "../tool-catalog.ts";

export class RuntimeToolNotFound extends Data.TaggedError("RuntimeToolNotFound")<{
  readonly names: ReadonlyArray<string>;
}> {}

export class RuntimeNotFound extends Data.TaggedError("RuntimeNotFound")<{
  readonly id: string;
  readonly kind: "dispatch" | "mission";
}> {}

export class RuntimeDispatchFailed extends Data.TaggedError("RuntimeDispatchFailed")<{
  readonly id: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type RuntimeError = RuntimeToolNotFound | RuntimeNotFound | RuntimeDispatchFailed;

export type MissionSessionState = "pending" | "running" | "done" | "failed";
export type DispatchSessionState = "running" | "done" | "failed";
export type WorkNodeKind = "dispatch" | "task" | "external";
export type WorkNodeRelation =
  | "root"
  | "delegated"
  | "continued"
  | "branched"
  | "prepared"
  | "spawned";
export type WorkNodeState = "pending" | "running" | "done" | "failed";

export interface MissionSession {
  readonly missionId: string;
  readonly capsuleId: string;
  readonly goal: string;
  readonly criteria: ReadonlyArray<string>;
  readonly state: MissionSessionState;
}

export interface WorkNodeSession {
  readonly workNodeId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parentWorkNodeId?: string;
  readonly kind: WorkNodeKind;
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly state: WorkNodeState;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export interface DispatchSession extends WorkNodeSession {
  readonly kind: "dispatch";
  readonly dispatchId: string;
  readonly name: string;
  readonly modelRequest?: Dispatch.ModelRequest;
  readonly iteration: number;
  readonly state: DispatchSessionState;
  readonly usage: Dispatch.Usage;
}

export type StatusEntry = DispatchSession;

export interface MissionDispatchInput {
  readonly spec: SerializedDispatchSpec;
  readonly task: string;
  readonly continueFrom?: string | undefined;
  readonly parentWorkNodeId?: string | undefined;
  readonly relation?: WorkNodeRelation | undefined;
}

export interface MissionCreateInput {
  readonly slug?: string;
  readonly goal: string;
  readonly criteria: ReadonlyArray<string>;
}

export interface MissionStartDispatchInput extends MissionDispatchInput {
  readonly missionId: string;
}

export type RuntimeCommand =
  | {
      readonly _tag: "MissionCreate";
      readonly input: MissionCreateInput;
    }
  | {
      readonly _tag: "MissionStartDispatch";
      readonly input: MissionStartDispatchInput;
    };

export type RuntimeDispatchEvent =
  | {
      readonly _tag: "WorkNodeStarted";
      readonly node: WorkNodeSession;
    }
  | {
      readonly _tag: "DispatchSessionStarted";
      readonly session: DispatchSession;
    }
  | {
      readonly _tag: "DispatchEvent";
      readonly workNodeId: string;
      readonly dispatchId: string;
      readonly missionId: string;
      readonly capsuleId: string;
      readonly event: Dispatch.DispatchEvent;
    };

export type RuntimeSubmission =
  | {
      readonly _tag: "MissionCreated";
      readonly mission: MissionSession;
    }
  | {
      readonly _tag: "DispatchStarted";
      readonly session: DispatchSession;
      readonly events: Stream.Stream<RuntimeDispatchEvent>;
    };

export type RuntimeControl =
  | {
      readonly _tag: "DispatchInject";
      readonly dispatchId: string;
      readonly text: string;
    }
  | {
      readonly _tag: "DispatchInterrupt";
      readonly dispatchId: string;
    };

export type RuntimeQuery =
  | {
      readonly _tag: "MissionList";
    }
  | {
      readonly _tag: "MissionGet";
      readonly missionId: string;
    }
  | {
      readonly _tag: "DispatchList";
      readonly options?: { readonly limit?: number };
    }
  | {
      readonly _tag: "MissionWorkTree";
      readonly missionId: string;
    }
  | {
      readonly _tag: "DispatchResult";
      readonly dispatchId: string;
    }
  | {
      readonly _tag: "CapsuleEvents";
      readonly capsuleId: string;
    }
  | {
      readonly _tag: "DispatchCapsuleEvents";
      readonly dispatchId: string;
    }
  | {
      readonly _tag: "ActiveStatus";
    };

export type RuntimeQueryResult =
  | {
      readonly _tag: "MissionList";
      readonly missions: ReadonlyArray<MissionSession>;
    }
  | {
      readonly _tag: "MissionGet";
      readonly mission: MissionSession;
    }
  | {
      readonly _tag: "DispatchList";
      readonly dispatches: ReadonlyArray<DispatchSession>;
    }
  | {
      readonly _tag: "MissionWorkTree";
      readonly nodes: ReadonlyArray<WorkNodeSession>;
    }
  | {
      readonly _tag: "DispatchResult";
      readonly result: Dispatch.DispatchOutput;
    }
  | {
      readonly _tag: "CapsuleEvents";
      readonly events: ReadonlyArray<CapsuleNs.CapsuleEvent>;
    }
  | {
      readonly _tag: "DispatchCapsuleEvents";
      readonly events: ReadonlyArray<CapsuleNs.CapsuleEvent>;
    }
  | {
      readonly _tag: "ActiveStatus";
      readonly status: ReadonlyArray<StatusEntry>;
    };

export interface RuntimeSnapshot {
  readonly missions: ReadonlyArray<MissionSession>;
  readonly active: ReadonlyArray<StatusEntry>;
}

export interface TheseusRuntimeService {
  readonly submit: (command: RuntimeCommand) => Effect.Effect<RuntimeSubmission, RuntimeError>;
  readonly control: (command: RuntimeControl) => Effect.Effect<void, RuntimeError>;
  readonly query: (query: RuntimeQuery) => Effect.Effect<RuntimeQueryResult, RuntimeError>;
  readonly getSnapshot: () => Effect.Effect<RuntimeSnapshot>;
}
