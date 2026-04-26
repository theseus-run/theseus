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

import { Cause, Deferred, Effect, Exit, Fiber, Match, Queue, Ref, Stream } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { SatelliteRing } from "../satellite/ring.ts";
import type { SatelliteAbort, SatelliteScope } from "../satellite/types.ts";
import * as DispatchEvents from "./events.ts";
import { drainInjections, injectionDetail } from "./injections.ts";
import { runDispatchIteration } from "./iteration.ts";
import { defaultMessages } from "./messages.ts";
import { CurrentDispatch, DispatchStore } from "./store.ts";
import type {
  DispatchError,
  DispatchEvent,
  DispatchHandle,
  DispatchOptions,
  DispatchOutput,
  DispatchSpec,
  Injection,
  Usage,
} from "./types.ts";
import { DispatchInterrupted } from "./types.ts";

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
  LanguageModel.LanguageModel | SatelliteRing | DispatchStore | Exclude<R, CurrentDispatch>
> =>
  Effect.gen(function* () {
    const maxIter = spec.maxIterations ?? 20;
    const zeroUsage: Usage = { inputTokens: 0, outputTokens: 0 };
    const store = yield* DispatchStore;
    const record = yield* store.create({
      name: spec.name,
      task,
      ...(options?.parentDispatchId !== undefined
        ? { parentDispatchId: options.parentDispatchId }
        : {}),
      ...(options?.dispatchId !== undefined ? { requestedId: options.dispatchId } : {}),
    });
    const dispatchId = record.id;
    const currentDispatch = record;

    const eventQueue = yield* Queue.unbounded<DispatchEvent, Cause.Done>();
    const injectionQueue = yield* Queue.unbounded<Injection>();
    const resultDeferred = yield* Deferred.make<DispatchOutput, DispatchError>();
    const messagesRef = yield* Ref.make<ReadonlyArray<Prompt.MessageEncoded>>([]);
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

    // -----------------------------------------------------------------------
    // loop — the dispatch loop, runs as a forked fiber
    // -----------------------------------------------------------------------

    const loop = (
      messages: ReadonlyArray<Prompt.MessageEncoded>,
      usage: Usage,
      iterations: number,
    ): Effect.Effect<
      DispatchOutput,
      DispatchError | SatelliteAbort,
      LanguageModel.LanguageModel | SatelliteRing | DispatchStore | R
    > =>
      Effect.withSpan("dispatch.iteration", { attributes: { "dispatch.iteration": iterations } })(
        Effect.gen(function* () {
          yield* Effect.yieldNow;

          const drained = yield* drainInjections(injectionQueue, messages, (injection) =>
            emit(
              DispatchEvents.injected(
                spec.name,
                iterations,
                injection._tag,
                injectionDetail(injection),
              ),
            ),
          );

          const prepared = yield* Match.value(drained).pipe(
            Match.tag("Continue", ({ messages }) => Effect.succeed(messages)),
            Match.tag("Interrupted", ({ reason }) =>
              Effect.fail(
                new DispatchInterrupted({
                  dispatchId,
                  name: spec.name,
                  reason: reason ?? "Interrupted via injection",
                }),
              ),
            ),
            Match.exhaustive,
          );

          yield* Ref.set(messagesRef, prepared);
          yield* store.snapshot(dispatchId, iterations, prepared, usage);

          const iteration = yield* runDispatchIteration<R>({
            dispatchId,
            spec,
            task,
            maxIterations: maxIter,
            messages: prepared,
            usage,
            iteration: iterations,
            satelliteScope,
            emit,
          });

          return yield* Match.value(iteration).pipe(
            Match.tag("Finished", ({ output }) =>
              Ref.set(messagesRef, output.messages).pipe(Effect.as(output)),
            ),
            Match.tag("Continue", (next) => loop(next.messages, next.usage, next.iteration)),
            Match.exhaustive,
          );
        }),
      );

    const initialMessages: ReadonlyArray<Prompt.MessageEncoded> =
      options?.messages ?? defaultMessages(spec.systemPrompt, task);
    const initialUsage = options?.usage ?? zeroUsage;
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
      loop(initialMessages, initialUsage, initialIteration).pipe(
        // Convert SatelliteAbort to DispatchInterrupted for the outer error channel
        Effect.mapError((err) =>
          err._tag === "SatelliteAbort"
            ? new DispatchInterrupted({
                dispatchId,
                name: spec.name,
                reason: `Satellite "${err.satellite}": ${err.reason}`,
              })
            : err,
        ),
        Effect.tap((result) => emit(DispatchEvents.done(spec.name, result))),
        Effect.onExit((exit) =>
          Exit.match(exit, {
            onSuccess: (result) => Deferred.succeed(resultDeferred, result),
            onFailure: (cause) => {
              const reason = Cause.hasInterruptsOnly(cause)
                ? "Fiber interrupted"
                : String(Cause.squash(cause));
              const failure = Cause.hasInterruptsOnly(cause)
                ? new DispatchInterrupted({
                    dispatchId,
                    name: spec.name,
                    reason,
                  })
                : undefined;
              return emit(DispatchEvents.failed(spec.name, reason)).pipe(
                Effect.flatMap(() =>
                  failure
                    ? Deferred.fail(resultDeferred, failure)
                    : Deferred.failCause(resultDeferred, cause),
                ),
              );
            },
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
      events: Stream.fromQueue(eventQueue).pipe(Stream.takeUntil((e) => e._tag === "Done")),
      inject: (i: Injection) => Queue.offer(injectionQueue, i).pipe(Effect.asVoid),
      interrupt: Fiber.interrupt(loopFiber).pipe(Effect.asVoid),
      result,
      messages: Ref.get(messagesRef),
    };
  }) as Effect.Effect<
    DispatchHandle,
    never,
    LanguageModel.LanguageModel | SatelliteRing | DispatchStore | Exclude<R, CurrentDispatch>
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
  LanguageModel.LanguageModel | SatelliteRing | DispatchStore | Exclude<R, CurrentDispatch>
> => dispatch(spec, task, options).pipe(Effect.flatMap((handle) => handle.result));
