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

import { Cause, Deferred, Effect, Exit, Fiber, Match, Option, Queue, Ref, Stream } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { SatelliteRing } from "../satellite/ring.ts";
import type { SatelliteAbort, SatelliteScope } from "../satellite/types.ts";
import type { Presentation } from "../tool/index.ts";
import { presentationToText, runToolCall, step, tryParseArgs } from "./step.ts";
import { CurrentDispatch, DispatchStore } from "./store.ts";
import type {
  DispatchError,
  DispatchEvent,
  DispatchHandle,
  DispatchOptions,
  DispatchOutput,
  DispatchSpec,
  Injection,
  ToolCallError,
  ToolCallResult,
  Usage,
} from "./types.ts";
import { DispatchCycleExceeded, DispatchInterrupted, DispatchToolFailed } from "./types.ts";

const presentationResult = (
  tc: { id: string; name: string },
  args: unknown,
  presentation: Presentation,
): ToolCallResult => ({
  callId: tc.id,
  name: tc.name,
  args,
  presentation,
  textContent: presentationToText(presentation),
});

// ---------------------------------------------------------------------------
// addUsage — accumulate token counts
// ---------------------------------------------------------------------------

const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

// ---------------------------------------------------------------------------
// drainInjections — apply all pending injections at iteration boundary.
// Returns modified messages, or null if Interrupt was seen.
// ---------------------------------------------------------------------------

const drainInjections = (
  injectionQueue: Queue.Queue<Injection>,
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  onInjection: (injection: Injection) => Effect.Effect<void>,
): Effect.Effect<ReadonlyArray<Prompt.MessageEncoded> | undefined> =>
  Effect.gen(function* () {
    let current = messages;
    let opt = yield* Queue.poll(injectionQueue);
    while (Option.isSome(opt)) {
      yield* onInjection(opt.value);
      const prev = current;
      const next = Match.value(opt.value).pipe(
        Match.tag("Interrupt", () => undefined),
        Match.tag("AppendMessages", (i) => [...prev, ...i.messages]),
        Match.tag("ReplaceMessages", (i) => i.messages),
        Match.tag("Redirect", (i) => [
          prev[0] ?? { role: "system" as const, content: "" },
          { role: "user" as const, content: i.task },
        ]),
        Match.tag("CollapseContext", () => prev),
        Match.exhaustive,
      );
      if (next === undefined) return undefined;
      current = next;
      opt = yield* Queue.poll(injectionQueue);
    }
    return current;
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

    const emitAll = <T>(items: ReadonlyArray<T>, toEvent: (item: T) => DispatchEvent) =>
      Effect.all(
        items.map((i) => emit(toEvent(i))),
        { concurrency: "unbounded" },
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
          const checkpointMessages =
            iterationStart._tag === "TransformMessages" ? iterationStart.messages : next;

          // --- Phase: BeforeCall ---
          const beforeCallAction = yield* satelliteScope.beforeCall(
            { messages: checkpointMessages },
            satCtx,
            onSatAction,
          );
          const callMessages =
            beforeCallAction._tag === "TransformMessages"
              ? beforeCallAction.messages
              : checkpointMessages;

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
          const result =
            afterCallAction._tag === "TransformStepResult" ? afterCallAction.stepResult : rawResult;

          if (result.toolCalls.length === 0)
            return {
              dispatchId,
              name: spec.name,
              content: result.content,
              usage: totalUsage,
            };

          // Emit ALL ToolCalling events BEFORE any tool runs (interrupt window).
          yield* emitAll(result.toolCalls, (tc) => ({
            _tag: "ToolCalling" as const,
            name: spec.name,
            iteration: iterations,
            tool: tc.name,
            args: tryParseArgs(tc),
          }));

          yield* satelliteScope.checkpoint("before-tools", satCtx, onSatAction);

          // Sequential by design: satellite state, tool effects, and events follow model order.
          const calls: ToolCallResult[] = [];
          for (const tc of result.toolCalls) {
            const beforeAction = yield* satelliteScope.beforeTool(
              { tool: tc },
              satCtx,
              onSatAction,
            );

            const callResult: ToolCallResult =
              beforeAction._tag === "BlockTool"
                ? presentationResult(tc, tryParseArgs(tc), beforeAction.presentation)
                : yield* runToolCall<R>(
                    spec.tools,
                    beforeAction._tag === "ModifyArgs"
                      ? { ...tc, arguments: JSON.stringify(beforeAction.args) }
                      : tc,
                  ).pipe(
                    Effect.catch((err: ToolCallError) =>
                      emit({
                        _tag: "ToolError",
                        name: spec.name,
                        iteration: iterations,
                        tool: tc.name,
                        error: err,
                      }).pipe(
                        Effect.flatMap(() =>
                          satelliteScope
                            .toolError({ tool: tc, error: err }, satCtx, onSatAction)
                            .pipe(
                              Effect.flatMap((action) =>
                                action._tag === "RecoverToolError"
                                  ? Effect.succeed(action.result)
                                  : Effect.fail(
                                      new DispatchToolFailed({
                                        dispatchId,
                                        name: spec.name,
                                        tool: tc.name,
                                        error: err,
                                      }),
                                    ),
                              ),
                            ),
                        ),
                      ),
                    ),
                  );

            const afterAction = yield* satelliteScope.afterTool(
              { tool: tc, result: callResult },
              satCtx,
              onSatAction,
            );

            const finalResult =
              afterAction._tag === "ReplaceToolResult"
                ? presentationResult(tc, callResult.args, afterAction.presentation)
                : callResult;

            calls.push(finalResult);
          }

          yield* satelliteScope.checkpoint("after-tools", satCtx, onSatAction);

          yield* emitAll(calls, (c) => ({
            _tag: "ToolResult" as const,
            name: spec.name,
            iteration: iterations,
            tool: c.name,
            content: c.textContent,
            isError: c.presentation.isError ?? false,
          }));

          // Build messages for next iteration (native Prompt.MessageEncoded format)
          const toolMessages: ReadonlyArray<Prompt.MessageEncoded> = calls.map((r) => ({
            role: "tool" as const,
            content: [
              {
                type: "tool-result" as const,
                id: r.callId,
                name: r.name,
                isFailure: r.presentation.isError ?? false,
                result: r.textContent,
              },
            ],
          }));

          const assistantMsg: Prompt.MessageEncoded = {
            role: "assistant" as const,
            content: [
              ...(result.content
                ? ([{ type: "text" as const, text: result.content }] as const)
                : []),
              ...result.toolCalls.map((tc) => ({
                type: "tool-call" as const,
                id: tc.id,
                name: tc.name,
                params: tryParseArgs(tc),
              })),
            ],
          };

          return yield* loop(
            [...callMessages, assistantMsg, ...toolMessages],
            totalUsage,
            iterations + 1,
          );
        }),
      );

    const initialMessages: ReadonlyArray<Prompt.MessageEncoded> = options?.messages ?? [
      { role: "system", content: spec.systemPrompt },
      { role: "user", content: task },
    ];
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
            onFailure: (cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Deferred.fail(
                    resultDeferred,
                    new DispatchInterrupted({
                      dispatchId,
                      name: spec.name,
                      reason: "Fiber interrupted",
                    }),
                  )
                : Deferred.failCause(resultDeferred, cause),
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
