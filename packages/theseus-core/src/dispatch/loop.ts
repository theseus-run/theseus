import { Effect, Match, type Queue, Ref } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { SatelliteAbort, SatelliteScope } from "../satellite/types.ts";
import * as DispatchEvents from "./events.ts";
import { drainInjections, injectionDetail } from "./injections.ts";
import { runDispatchIteration } from "./iteration.ts";
import { interrupted } from "./lifecycle.ts";
import type { DispatchStore } from "./store.ts";
import type {
  DispatchError,
  DispatchEvent,
  DispatchOutput,
  DispatchSpec,
  Injection,
  Usage,
} from "./types.ts";

type Emit = (event: DispatchEvent) => Effect.Effect<void>;

export interface DispatchLoopInput<R> {
  readonly dispatchId: string;
  readonly spec: DispatchSpec<R>;
  readonly task: string;
  readonly maxIterations: number;
  readonly store: (typeof DispatchStore)["Service"];
  readonly injectionQueue: Queue.Queue<Injection>;
  readonly messagesRef: Ref.Ref<ReadonlyArray<Prompt.MessageEncoded>>;
  readonly satelliteScope: SatelliteScope<R>;
  readonly emit: Emit;
}

const prepareIterationMessages = (input: {
  readonly dispatchId: string;
  readonly name: string;
  readonly iteration: number;
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
  readonly injectionQueue: Queue.Queue<Injection>;
  readonly emit: Emit;
}): Effect.Effect<ReadonlyArray<Prompt.MessageEncoded>, DispatchError> =>
  Effect.gen(function* () {
    const drained = yield* drainInjections(input.injectionQueue, input.messages, (injection) =>
      input.emit(
        DispatchEvents.injected(
          input.name,
          input.iteration,
          injection._tag,
          injectionDetail(injection),
        ),
      ),
    );

    return yield* Match.value(drained).pipe(
      Match.tag("Continue", ({ messages }) => Effect.succeed(messages)),
      Match.tag("Interrupted", ({ reason }) =>
        Effect.fail(
          interrupted(
            { dispatchId: input.dispatchId, name: input.name },
            reason ?? "Interrupted via injection",
          ),
        ),
      ),
      Match.exhaustive,
    );
  });

export const runDispatchLoop = <R>(
  input: DispatchLoopInput<R>,
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  usage: Usage,
  iteration: number,
): Effect.Effect<DispatchOutput, DispatchError | SatelliteAbort, LanguageModel.LanguageModel | R> =>
  Effect.withSpan("dispatch.iteration", { attributes: { "dispatch.iteration": iteration } })(
    Effect.gen(function* () {
      yield* Effect.yieldNow;

      const prepared = yield* prepareIterationMessages({
        dispatchId: input.dispatchId,
        name: input.spec.name,
        iteration,
        messages,
        injectionQueue: input.injectionQueue,
        emit: input.emit,
      });

      yield* Ref.set(input.messagesRef, prepared);
      yield* input.store.snapshot(input.dispatchId, iteration, prepared, usage);

      const iterationResult = yield* runDispatchIteration<R>({
        dispatchId: input.dispatchId,
        spec: input.spec,
        task: input.task,
        maxIterations: input.maxIterations,
        messages: prepared,
        usage,
        iteration,
        satelliteScope: input.satelliteScope,
        emit: input.emit,
      });

      return yield* Match.value(iterationResult).pipe(
        Match.tag("Finished", ({ output }) =>
          Ref.set(input.messagesRef, output.messages).pipe(Effect.as(output)),
        ),
        Match.tag("Continue", (next) =>
          runDispatchLoop(input, next.messages, next.usage, next.iteration),
        ),
        Match.exhaustive,
      );
    }),
  );
