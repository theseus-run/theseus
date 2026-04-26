import type * as CapsuleNs from "@theseus.run/core/Capsule";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Data, type Effect, type Stream } from "effect";
import type { StatusEntry } from "../registry.ts";
import type { SerializedDispatchSpec } from "../tool-catalog.ts";

export class RuntimeToolNotFound extends Data.TaggedError("RuntimeToolNotFound")<{
  readonly names: ReadonlyArray<string>;
}> {}

export class RuntimeNotFound extends Data.TaggedError("RuntimeNotFound")<{
  readonly id: string;
  readonly kind: "dispatch";
}> {}

export class RuntimeDispatchFailed extends Data.TaggedError("RuntimeDispatchFailed")<{
  readonly id: string;
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type RuntimeError = RuntimeToolNotFound | RuntimeNotFound | RuntimeDispatchFailed;

export interface StartDispatchInput {
  readonly spec: SerializedDispatchSpec;
  readonly task: string;
  readonly continueFrom?: string | undefined;
}

export type RuntimeCommand = {
  readonly _tag: "DispatchStart";
  readonly input: StartDispatchInput;
};

export type RuntimeSubmission = {
  readonly _tag: "DispatchStarted";
  readonly events: Stream.Stream<Dispatch.DispatchEvent>;
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
      readonly _tag: "DispatchList";
      readonly options?: { readonly limit?: number };
    }
  | {
      readonly _tag: "DispatchMessages";
      readonly dispatchId: string;
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
      readonly _tag: "ActiveStatus";
    };

export type RuntimeQueryResult =
  | {
      readonly _tag: "DispatchList";
      readonly dispatches: ReadonlyArray<Dispatch.DispatchSummary>;
    }
  | {
      readonly _tag: "DispatchMessages";
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
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
      readonly _tag: "ActiveStatus";
      readonly status: ReadonlyArray<StatusEntry>;
    };

export interface RuntimeSnapshot {
  readonly active: ReadonlyArray<StatusEntry>;
}

export interface TheseusRuntimeService {
  readonly submit: (command: RuntimeCommand) => Effect.Effect<RuntimeSubmission, RuntimeError>;
  readonly control: (command: RuntimeControl) => Effect.Effect<void, RuntimeError>;
  readonly query: (query: RuntimeQuery) => Effect.Effect<RuntimeQueryResult, RuntimeError>;
  readonly getSnapshot: () => Effect.Effect<RuntimeSnapshot>;
}
