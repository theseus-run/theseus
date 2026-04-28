import { Context, type Effect } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";

export type CortexNodeId = string;
export type CortexSignalId = string;

export type CortexSlot =
  | "harness"
  | "workspace"
  | "mission"
  | "work-node"
  | "observations"
  | "history"
  | "recall";

export type CortexAuthority = "system" | "developer" | "user" | "assistant" | "tool";

export type CortexDiff<State> =
  | { readonly _tag: "Initial"; readonly next: State }
  | { readonly _tag: "Unchanged"; readonly current: State }
  | { readonly _tag: "Changed"; readonly previous: State; readonly next: State };

export const CortexDiffs = {
  initial: <State>(next: State): CortexDiff<State> => ({ _tag: "Initial", next }),
  unchanged: <State>(current: State): CortexDiff<State> => ({ _tag: "Unchanged", current }),
  changed: <State>(previous: State, next: State): CortexDiff<State> => ({
    _tag: "Changed",
    previous,
    next,
  }),
};

export interface CortexSignal {
  readonly id: CortexSignalId;
  readonly nodeId: CortexNodeId;
  readonly slot: CortexSlot;
  readonly authority: CortexAuthority;
  readonly priority: number;
  readonly text: string;
}

export interface CortexFrame {
  readonly signals: ReadonlyArray<CortexSignal>;
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
}

export interface CortexRenderInput {
  readonly history: ReadonlyArray<Prompt.MessageEncoded>;
  readonly dispatch: {
    readonly dispatchId: string;
    readonly name: string;
    readonly task: string;
    readonly iteration: number;
  };
}

export interface CortexNode<State = unknown> {
  readonly id: CortexNodeId;
  snapshot(input: CortexRenderInput): Effect.Effect<State>;
  diff(previous: State | undefined, next: State): CortexDiff<State>;
  emit(state: State, diff: CortexDiff<State>): Effect.Effect<ReadonlyArray<CortexSignal>>;
}

export interface CortexService {
  readonly render: (input: CortexRenderInput) => Effect.Effect<CortexFrame>;
}

export class Cortex extends Context.Service<Cortex, CortexService>()("Cortex") {}
