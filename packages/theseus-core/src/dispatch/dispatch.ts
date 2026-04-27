/**
 * Dispatch — full machine: loop + events + injection + fiber handle.
 *
 * dispatch() returns a DispatchHandle immediately — the loop runs as a forked fiber.
 *
 *   handle.events    Stream<DispatchEvent> — observe every state transition
 *   handle.inject    push Injection — processed at the start of the next iteration
 *   handle.interrupt preemptive Fiber.interrupt — kills mid-LLM-call or mid-tool-call
 *   handle.result    Effect<DispatchOutput, DispatchError> — await the final value
 *
 * Uses LanguageModel from effect/unstable/ai via generateText.
 */

import { type Cause, Deferred, Effect, Fiber, Queue, Ref, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { SatelliteRing } from "../satellite/ring.ts";
import type { SatelliteScope } from "../satellite/types.ts";
import * as DispatchEvents from "./events.ts";
import { normalizeLoopError, settleDispatchResult, zeroUsage } from "./lifecycle.ts";
import { runDispatchLoop } from "./loop.ts";
import { defaultMessages } from "./messages.ts";
import { LanguageModelGateway } from "./model-gateway.ts";
import { CurrentDispatch, DispatchStore } from "./store.ts";
import type {
  DispatchError,
  DispatchEvent,
  DispatchHandle,
  DispatchOptions,
  DispatchOutput,
  DispatchSpec,
  Injection,
} from "./types.ts";
import { DispatchModelFailed } from "./types.ts";

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export const dispatch = <R = never>(
  spec: DispatchSpec<R>,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<
  DispatchHandle,
  never,
  LanguageModelGateway | SatelliteRing | DispatchStore | Exclude<R, CurrentDispatch>
> =>
  Effect.gen(function* () {
    const maxIter = spec.maxIterations ?? 20;
    const store = yield* DispatchStore;
    const record = yield* store.create({
      name: spec.name,
      task,
      ...(options?.parentDispatchId !== undefined
        ? { parentDispatchId: options.parentDispatchId }
        : {}),
      ...(spec.modelRequest !== undefined ? { modelRequest: spec.modelRequest } : {}),
      ...(options?.dispatchId !== undefined ? { requestedId: options.dispatchId } : {}),
    });
    const dispatchId = record.id;
    const currentDispatch = record;

    const eventQueue = yield* Queue.unbounded<DispatchEvent, Cause.Done>();
    const injectionQueue = yield* Queue.unbounded<Injection>();
    const resultDeferred = yield* Deferred.make<DispatchOutput, DispatchError>();
    const messagesRef = yield* Ref.make<ReadonlyArray<Prompt.MessageEncoded>>([]);
    const modelGateway = yield* LanguageModelGateway;
    const ring = yield* SatelliteRing;
    const satelliteScope = yield* (
      ring.openScope({
        dispatchId,
        name: spec.name,
        task,
      }) as Effect.Effect<SatelliteScope<R>, never, R>
    ).pipe(Effect.provideService(CurrentDispatch, currentDispatch));

    const emit = (event: DispatchEvent): Effect.Effect<void> =>
      Queue.offer(eventQueue, event).pipe(
        Effect.tap(() => store.record(dispatchId, event)),
        Effect.asVoid,
      );

    const initialMessages: ReadonlyArray<Prompt.MessageEncoded> =
      options?.messages ?? defaultMessages(spec.systemPrompt, task);
    const initialUsage = options?.usage ?? zeroUsage();
    const initialIteration = options?.iteration ?? 0;

    // Record parent link for dispatch tracing
    if (options?.parentDispatchId) {
      yield* store.record(
        dispatchId,
        DispatchEvents.injected(
          spec.name,
          initialIteration,
          "ParentLink",
          options.parentDispatchId,
        ),
      );
    }

    const loopFiber = yield* Effect.forkDetach({ startImmediately: true })(
      Effect.gen(function* () {
        const languageModel = yield* modelGateway.resolve(spec.modelRequest).pipe(
          Effect.mapError(
            (error) =>
              new DispatchModelFailed({
                dispatchId,
                name: spec.name,
                message: error.reason,
                cause: error,
              }),
          ),
        );

        return yield* runDispatchLoop<R>(
          {
            dispatchId,
            spec,
            task,
            maxIterations: maxIter,
            store,
            injectionQueue,
            messagesRef,
            satelliteScope,
            emit,
          },
          initialMessages,
          initialUsage,
          initialIteration,
        ).pipe(Effect.provideService(LanguageModel.LanguageModel, languageModel));
      }).pipe(
        Effect.mapError((err) => normalizeLoopError({ dispatchId, name: spec.name }, err)),
        Effect.tap((result) => emit(DispatchEvents.done(spec.name, result))),
        Effect.onExit((exit) =>
          settleDispatchResult({
            identity: { dispatchId, name: spec.name },
            exit,
            emitFailed: emit,
            succeed: (result) => Deferred.succeed(resultDeferred, result),
            fail: (error) => Deferred.fail(resultDeferred, error),
            failCause: (cause) => Deferred.failCause(resultDeferred, cause),
          }),
        ),
        Effect.ensuring(Queue.end(eventQueue)),
        // OTEL: dispatch span — auto parent-child when nested dispatches use withSpan
        Effect.withSpan("dispatch", {
          attributes: { "dispatch.id": dispatchId, "dispatch.name": spec.name },
        }),
        Effect.annotateLogs("dispatchId", dispatchId),
        Effect.annotateLogs("dispatchName", spec.name),
        Effect.provideService(CurrentDispatch, currentDispatch),
        Effect.ensuring(satelliteScope.close),
      ),
    );

    const result: Effect.Effect<DispatchOutput, DispatchError> = Deferred.await(resultDeferred);

    return {
      dispatchId,
      events: Stream.fromQueue(eventQueue).pipe(Stream.takeUntil(DispatchEvents.isTerminal)),
      inject: (i: Injection) => Queue.offer(injectionQueue, i).pipe(Effect.asVoid),
      interrupt: Fiber.interrupt(loopFiber).pipe(Effect.asVoid),
      result,
      messages: Ref.get(messagesRef),
    };
  }) as Effect.Effect<
    DispatchHandle,
    never,
    LanguageModelGateway | SatelliteRing | DispatchStore | Exclude<R, CurrentDispatch>
  >;

// ---------------------------------------------------------------------------
// dispatchAwait — convenience when you only need the final result
// ---------------------------------------------------------------------------

export const dispatchAwait = <R = never>(
  spec: DispatchSpec<R>,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<
  DispatchOutput,
  DispatchError,
  LanguageModelGateway | SatelliteRing | DispatchStore | Exclude<R, CurrentDispatch>
> => dispatch(spec, task, options).pipe(Effect.flatMap((handle) => handle.result));
