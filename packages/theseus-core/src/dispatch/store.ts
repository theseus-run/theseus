/**
 * DispatchStore — collection boundary for dispatch records.
 *
 * Minimal today: create a dispatch record and own id generation.
 * Later this grows into durable create/resume/list/search storage.
 */

import { Clock, Context, Effect, Layer, Random } from "effect";

export type DispatchId = string & { readonly _brand: unique symbol };

export interface DispatchCreate {
  readonly name: string;
  readonly task: string;
  readonly parentDispatchId?: string;
  readonly requestedId?: string;
}

export interface DispatchRecord {
  readonly id: DispatchId;
}

export class DispatchStore extends Context.Service<
  DispatchStore,
  {
    readonly create: (input: DispatchCreate) => Effect.Effect<DispatchRecord>;
  }
>()("DispatchStore") {}

export class CurrentDispatch extends Context.Service<
  CurrentDispatch,
  {
    readonly id: DispatchId;
    readonly name: string;
    readonly task: string;
    readonly parentDispatchId?: string;
    readonly record: DispatchRecord;
  }
>()("CurrentDispatch") {}

const makeDispatchId = (name: string): Effect.Effect<DispatchId> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const rand = yield* Random.nextIntBetween(0, 36 ** 5 - 1);
    return `${name}-${now.toString(36)}-${rand.toString(36).padStart(5, "0")}` as DispatchId;
  });

export const InMemoryDispatchStore: Layer.Layer<DispatchStore> = Layer.succeed(DispatchStore)({
  create: (input) =>
    Effect.gen(function* () {
      const id =
        input.requestedId !== undefined
          ? (input.requestedId as DispatchId)
          : yield* makeDispatchId(input.name);
      return { id };
    }),
});
