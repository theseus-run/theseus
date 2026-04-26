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
import { drainInjections } from "./injections.ts";
import {
  assistantToolMessage,
  defaultMessages,
  finalAssistantMessages,
  toolResultMessages,
} from "./messages.ts";
import { step } from "./step.ts";
import { CurrentDispatch, DispatchStore } from "./store.ts";
import { runDispatchToolCalls } from "./tool-loop.ts";
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
import { DispatchCycleExceeded, DispatchInterrupted } from "./types.ts";

// ---------------------------------------------------------------------------
// addUsage — accumulate token counts
// ---------------------------------------------------------------------------

const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

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

          const logInjection = (injection: Injection): Effect.Effect<void> => {
            const detail =
              injection._tag === "Redirect"
                ? injection.task
                : injection._tag === "Interrupt"
                  ? injection.reason
                  : undefined;
            const base = {
              _tag: "Injected" as const,
              name: spec.name,
              iteration: iterations,
              injection: injection._tag,
            };
            return emit(detail !== undefined ? { ...base, detail } : base);
          };

          const next = yield* drainInjections(injectionQueue, messages, logInjection);
          if (next === undefined)
            return yield* Effect.fail(
              new DispatchInterrupted({
                dispatchId,
                name: spec.name,
                reason: "Interrupted via injection",
              }),
            );

          if (iterations >= maxIter)
            return yield* Effect.fail(
              new DispatchCycleExceeded({ dispatchId, name: spec.name, max: maxIter, usage }),
            );

          yield* Ref.set(messagesRef, next);
          yield* store.snapshot(dispatchId, iterations, next, usage);

          const satCtx = { dispatchId, name: spec.name, task, iteration: iterations };
          const onSatAction = (satellite: string, phase: string, action: string) =>
            emit({
              _tag: "SatelliteAction",
              name: spec.name,
              iteration: iterations,
              satellite,
              phase,
              action,
            });

          const iterationStart = yield* satelliteScope.checkpoint(
            "iteration-start",
            satCtx,
            onSatAction,
          );
          const checkpointMessages = Match.value(iterationStart).pipe(
            Match.tag("Pass", () => next),
            Match.tag("TransformMessages", (decision) => decision.messages),
            Match.exhaustive,
          );

          // --- Phase: BeforeCall ---
          const beforeCallAction = yield* satelliteScope.beforeCall(
            { messages: checkpointMessages },
            satCtx,
            onSatAction,
          );
          const callMessages = Match.value(beforeCallAction).pipe(
            Match.tag("Pass", () => checkpointMessages),
            Match.tag("TransformMessages", (decision) => decision.messages),
            Match.exhaustive,
          );

          yield* emit({ _tag: "Calling", name: spec.name, iteration: iterations });

          const rawResult = yield* step(callMessages, spec.tools, dispatchId, spec.name).pipe(
            Effect.withSpan("llm-call", {
              attributes: { "llm.name": spec.name, "llm.iteration": iterations },
            }),
          );
          const totalUsage = addUsage(usage, rawResult.usage);

          if (rawResult.thinking) {
            yield* emit({
              _tag: "Thinking",
              name: spec.name,
              iteration: iterations,
              content: rawResult.thinking,
            });
          }

          if (rawResult.content) {
            yield* emit({
              _tag: "Text",
              name: spec.name,
              iteration: iterations,
              content: rawResult.content,
            });
          }

          // --- Phase: AfterCall ---
          const afterCallAction = yield* satelliteScope.afterCall(
            { stepResult: rawResult },
            satCtx,
            onSatAction,
          );
          const result = Match.value(afterCallAction).pipe(
            Match.tag("Pass", () => rawResult),
            Match.tag("TransformStepResult", (decision) => decision.stepResult),
            Match.exhaustive,
          );

          if (result.toolCalls.length === 0) {
            const finalMessages = finalAssistantMessages(callMessages, result.content);
            yield* Ref.set(messagesRef, finalMessages);
            return {
              dispatchId,
              name: spec.name,
              content: result.content,
              messages: finalMessages,
              usage: totalUsage,
            };
          }

          const calls = yield* runDispatchToolCalls<R>({
            dispatchId,
            name: spec.name,
            iteration: iterations,
            tools: spec.tools,
            toolCalls: result.toolCalls,
            satelliteScope,
            satelliteContext: satCtx,
            onSatelliteAction: onSatAction,
            emit,
          });

          // Build messages for next iteration (native Prompt.MessageEncoded format)
          const toolMessages = toolResultMessages(calls);
          const assistantMsg = assistantToolMessage(result.content, result.toolCalls);

          return yield* loop(
            [...callMessages, assistantMsg, ...toolMessages],
            totalUsage,
            iterations + 1,
          );
        }),
      );

    const initialMessages: ReadonlyArray<Prompt.MessageEncoded> =
      options?.messages ?? defaultMessages(spec.systemPrompt, task);
    const initialUsage = options?.usage ?? zeroUsage;
    const initialIteration = options?.iteration ?? 0;

    // Record parent link for dispatch tracing
    if (options?.parentDispatchId) {
      yield* store.record(dispatchId, {
        _tag: "Injected",
        name: spec.name,
        iteration: initialIteration,
        injection: "ParentLink",
        detail: options.parentDispatchId,
      });
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
        Effect.tap((result) => emit({ _tag: "Done", name: spec.name, result })),
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
              return emit({ _tag: "Failed", name: spec.name, reason }).pipe(
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
