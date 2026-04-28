import { Context, Effect, Layer } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";

export interface CortexFrame {
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

export interface CortexService {
  readonly render: (input: CortexRenderInput) => Effect.Effect<CortexFrame>;
}

export class Cortex extends Context.Service<Cortex, CortexService>()("Cortex") {}

export const NoopCortex = Layer.succeed(Cortex)(
  Cortex.of({
    render: ({ history }) => Effect.succeed({ messages: history }),
  }),
);
