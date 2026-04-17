/**
 * Dispatch — full machine: loop + events + injection + fiber handle.
 *
 * dispatch() returns a DispatchHandle immediately — the loop runs as a forked fiber.
 *
 *   handle.events    Stream<DispatchEvent> — observe every state transition
 *   handle.inject    push Injection — processed at the start of the next iteration
 *   handle.interrupt preemptive Fiber.interrupt — kills mid-LLM-call or mid-tool-call
 *   handle.result    Effect<AgentResult, AgentError> — await the final value
 *
 * Uses LanguageModel from effect/unstable/ai via stepStream.
 */

import { Cause, Deferred, Effect, Exit, Fiber, Match, Option, Queue, Ref, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { AgentInterrupted, AgentCycleExceeded } from "../agent/index.ts";
import type { AgentResult, AgentError, Blueprint } from "../agent/index.ts";
import { report } from "../agent-comm/report.ts";
import { SatelliteRing } from "../satellite/ring.ts";
import type { SatelliteAbort } from "../satellite/types.ts";
import { textPresentation } from "../tool/index.ts";
import type { Presentation } from "../tool/index.ts";
import { DispatchLog } from "./log.ts";
import { presentationToText, runToolCall, stepStream, tryParseArgs } from "./step.ts";
import type { ToolCallError, ToolCallResult } from "./types.ts";
import type { DispatchEvent, DispatchHandle, DispatchOptions, Injection, Usage } from "./types.ts";

// Build a synthetic ToolCallResult from a plain text string (used by satellites).
const syntheticResult = (
  tc: { id: string; name: string },
  args: unknown,
  content: string,
  isError = false,
): ToolCallResult => {
  const presentation: Presentation = isError
    ? textPresentation(content, { isError: true })
    : textPresentation(content);
  return {
    callId: tc.id,
    name: tc.name,
    args,
    presentation,
    textContent: presentationToText(presentation),
  };
};

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
): Effect.Effect<ReadonlyArray<Prompt.MessageEncoded> | null> =>
  Effect.gen(function* () {
    let current = messages;
    let opt = yield* Queue.poll(injectionQueue);
    while (Option.isSome(opt)) {
      yield* onInjection(opt.value);
      const prev = current;
      const next = Match.value(opt.value).pipe(
        Match.tag("Interrupt", () => null as ReadonlyArray<Prompt.MessageEncoded> | null),
        Match.tag("AppendMessages", (i) => [...prev, ...i.messages]),
        Match.tag("ReplaceMessages", (i) => i.messages),
        Match.tag("Redirect", (i) => [
          prev[0] ?? { role: "system" as const, content: "" },
          { role: "user" as const, content: i.task },
        ]),
        Match.tag("CollapseContext", () => prev),
        Match.exhaustive,
      );
      if (next === null) return null;
      current = next;
      opt = yield* Queue.poll(injectionQueue);
    }
    return current;
  });

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export const dispatch = (
  blueprint: Blueprint,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<DispatchHandle, never, LanguageModel.LanguageModel | SatelliteRing | DispatchLog> =>
  Effect.gen(function* () {
    const maxIter = blueprint.maxIterations ?? 20;
    const zeroUsage: Usage = { inputTokens: 0, outputTokens: 0 };
    const dispatchId = options?.dispatchId ?? `${blueprint.name}-${Date.now().toString(36)}`;

    const eventQueue = yield* Queue.unbounded<DispatchEvent, Cause.Done>();
    const injectionQueue = yield* Queue.unbounded<Injection>();
    const resultDeferred = yield* Deferred.make<AgentResult, AgentError>();
    const messagesRef = yield* Ref.make<ReadonlyArray<Prompt.MessageEncoded>>([]);
    const log = yield* DispatchLog;

    const emit = (event: DispatchEvent): Effect.Effect<void> =>
      Queue.offer(eventQueue, event).pipe(
        Effect.tap(() => log.record(dispatchId, event)),
        Effect.asVoid,
      );

    const emitAll = <T>(items: ReadonlyArray<T>, toEvent: (item: T) => DispatchEvent) =>
      Effect.all(items.map((i) => emit(toEvent(i))), { concurrency: "unbounded" });

    // -----------------------------------------------------------------------
    // loop — the dispatch loop, runs as a forked fiber
    // -----------------------------------------------------------------------

    const loop = (
      messages: ReadonlyArray<Prompt.MessageEncoded>,
      usage: Usage,
      iterations: number,
    ): Effect.Effect<AgentResult, AgentError | SatelliteAbort, LanguageModel.LanguageModel | SatelliteRing | DispatchLog> =>
      Effect.withSpan("dispatch.iteration", { attributes: { "dispatch.iteration": iterations } })(Effect.gen(function* () {
        yield* Effect.yieldNow;

        const logInjection = (injection: Injection): Effect.Effect<void> => {
          const detail = injection._tag === "Redirect" ? injection.task
            : injection._tag === "Interrupt" ? injection.reason
            : undefined;
          const base = { _tag: "Injected" as const, agent: blueprint.name, iteration: iterations, injection: injection._tag };
          return emit(detail !== undefined ? { ...base, detail } : base);
        };

        const next = yield* drainInjections(injectionQueue, messages, logInjection);
        if (next === null)
          return yield* Effect.fail(
            new AgentInterrupted({ agent: blueprint.name, reason: "Interrupted via injection" }),
          );

        if (iterations >= maxIter)
          return yield* Effect.fail(
            new AgentCycleExceeded({ agent: blueprint.name, max: maxIter, usage }),
          );

        yield* Ref.set(messagesRef, next);
        yield* log.snapshot(dispatchId, iterations, next, usage);

        const ring = yield* SatelliteRing;
        const satCtx = { agent: blueprint.name, iteration: iterations };
        const onSatAction = (satellite: string, phase: string, action: string) =>
          emit({ _tag: "SatelliteAction", agent: blueprint.name, iteration: iterations, satellite, phase, action });

        // --- Phase: BeforeCall ---
        const beforeCallAction = yield* ring.run(
          { _tag: "BeforeCall", messages: next },
          satCtx,
          onSatAction,
        );
        const callMessages = beforeCallAction._tag === "TransformMessages"
          ? beforeCallAction.messages
          : next;

        yield* emit({ _tag: "Calling", agent: blueprint.name, iteration: iterations });

        const rawResult = yield* stepStream(callMessages, blueprint.tools, blueprint.name, (chunk) =>
          Match.value(chunk.type).pipe(
            Match.when("text-delta", () =>
              emit({ _tag: "TextDelta", agent: blueprint.name, iteration: iterations, content: chunk.delta }),
            ),
            Match.when("reasoning-delta", () =>
              emit({ _tag: "ThinkingDelta", agent: blueprint.name, iteration: iterations, content: chunk.delta }),
            ),
            Match.orElse(() => Effect.void),
          ),
        ).pipe(Effect.withSpan("llm-call", { attributes: { "llm.agent": blueprint.name, "llm.iteration": iterations } }));
        const totalUsage = addUsage(usage, rawResult.usage);

        if (rawResult.thinking) {
          yield* emit({ _tag: "Thinking", agent: blueprint.name, iteration: iterations, content: rawResult.thinking });
        }

        // --- Phase: AfterCall ---
        const afterCallAction = yield* ring.run(
          { _tag: "AfterCall", stepResult: rawResult },
          satCtx,
          onSatAction,
        );
        const result = afterCallAction._tag === "TransformStepResult"
          ? afterCallAction.stepResult
          : rawResult;

        if (result._tag === "text") return {
          result: "unstructured" as const,
          summary: "",
          content: result.content,
          usage: totalUsage,
        };

        // Check for theseus.report — terminates the loop with structured data
        const reportCall = result.toolCalls.find((tc) => tc.name === report.name);
        if (reportCall) {
          const args = tryParseArgs(reportCall) as {
            result?: string;
            summary?: string;
            content?: string;
          };
          yield* emit({
            _tag: "ToolCalling",
            agent: blueprint.name,
            iteration: iterations,
            tool: report.name,
            args,
          });
          return {
            result: (args.result ?? "unstructured") as AgentResult["result"],
            summary: args.summary ?? "",
            content: args.content ?? "",
            usage: totalUsage,
          };
        }

        // Emit ALL ToolCalling events BEFORE any tool runs (interrupt window).
        yield* emitAll(result.toolCalls, (tc) => ({
          _tag: "ToolCalling" as const,
          agent: blueprint.name,
          iteration: iterations,
          tool: tc.name,
          args: tryParseArgs(tc),
        }));

        // --- Phase: BeforeTool + execute + ToolError + AfterTool (per tool) ---
        const calls = yield* Effect.all(
          result.toolCalls.map((tc) =>
            Effect.gen(function* () {
              // BeforeTool
              const beforeAction = yield* ring.run(
                { _tag: "BeforeTool", tool: tc },
                satCtx,
                onSatAction,
              );

              if (beforeAction._tag === "BlockTool") {
                return syntheticResult(tc, undefined, beforeAction.content);
              }

              const effectiveTc = beforeAction._tag === "ModifyArgs"
                ? { ...tc, arguments: JSON.stringify(beforeAction.args) }
                : tc;

              // Execute tool
              const callResult: ToolCallResult = yield* runToolCall(blueprint.tools, effectiveTc).pipe(
                Effect.catch((err: ToolCallError) =>
                  emit({ _tag: "ToolError", agent: blueprint.name, iteration: iterations, tool: tc.name, error: err }).pipe(
                    Effect.flatMap(() =>
                      ring.run({ _tag: "ToolError", tool: tc, error: err }, satCtx, onSatAction).pipe(
                        Effect.flatMap((action) =>
                          action._tag === "RecoverToolError"
                            ? Effect.succeed(action.result)
                            : Effect.fail(new AgentInterrupted({ agent: blueprint.name, reason: `Unrecovered tool error: ${tc.name}` })),
                        ),
                      ),
                    ),
                  ),
                ),
              );

              // AfterTool
              const afterAction = yield* ring.run(
                { _tag: "AfterTool", tool: tc, result: callResult },
                satCtx,
                onSatAction,
              );

              return afterAction._tag === "ReplaceResult"
                ? syntheticResult(tc, callResult.args, afterAction.content, callResult.presentation.isError ?? false)
                : callResult;
            }).pipe(Effect.withSpan("tool-call", { attributes: { "tool.name": tc.name, "tool.id": tc.id } })),
          ),
          { concurrency: "unbounded" },
        );

        yield* emitAll(calls, (c) => ({
          _tag: "ToolResult" as const,
          agent: blueprint.name,
          iteration: iterations,
          tool: c.name,
          content: c.textContent,
          isError: c.presentation.isError ?? false,
        }));

        // Build messages for next iteration (native Prompt.MessageEncoded format)
        const toolMessages: ReadonlyArray<Prompt.MessageEncoded> = calls.map((r) => ({
          role: "tool" as const,
          content: [{
            type: "tool-result" as const,
            id: r.callId,
            name: r.name,
            isFailure: r.presentation.isError ?? false,
            result: r.textContent,
          }],
        }));

        const assistantMsg: Prompt.MessageEncoded = {
          role: "assistant" as const,
          content: result.toolCalls.map((tc) => {
            let params: unknown;
            try { params = JSON.parse(tc.arguments); } catch { params = {}; }
            return { type: "tool-call" as const, id: tc.id, name: tc.name, params };
          }),
        };

        return yield* loop(
          [...callMessages, assistantMsg, ...toolMessages],
          totalUsage,
          iterations + 1,
        );
      }));

    const initialMessages: ReadonlyArray<Prompt.MessageEncoded> = options?.messages ?? [
      { role: "system", content: blueprint.systemPrompt },
      { role: "user", content: task },
    ];
    const initialUsage = options?.usage ?? zeroUsage;
    const initialIteration = options?.iteration ?? 0;

    // Record parent link for dispatch tracing
    if (options?.parentDispatchId) {
      yield* log.record(dispatchId, {
        _tag: "Injected",
        agent: blueprint.name,
        iteration: initialIteration,
        injection: "ParentLink",
        detail: options.parentDispatchId,
      });
    }

    const loopFiber = yield* Effect.forkDetach({ startImmediately: true })(
      loop(initialMessages, initialUsage, initialIteration).pipe(
        // Convert SatelliteAbort to AgentInterrupted for the outer error channel
        Effect.mapError((err) =>
          err._tag === "SatelliteAbort"
            ? new AgentInterrupted({ agent: blueprint.name, reason: `Satellite "${err.satellite}": ${err.reason}` })
            : err,
        ),
        Effect.tap((result) =>
          emit({ _tag: "Done", agent: blueprint.name, result }),
        ),
        Effect.onExit((exit) =>
          Exit.match(exit, {
            onSuccess: (result) => Deferred.succeed(resultDeferred, result),
            onFailure: (cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Deferred.fail(resultDeferred, new AgentInterrupted({ agent: blueprint.name, reason: "Fiber interrupted" }))
                : Deferred.failCause(resultDeferred, cause),
          }),
        ),
        Effect.ensuring(Queue.end(eventQueue)),
        // OTEL: dispatch span — auto parent-child when nested dispatches use withSpan
        Effect.withSpan("dispatch", { attributes: { "dispatch.id": dispatchId, "dispatch.agent": blueprint.name } }),
        Effect.annotateLogs("dispatchId", dispatchId),
        Effect.annotateLogs("agent", blueprint.name),
      ),
    );

    const result: Effect.Effect<AgentResult, AgentError> = Deferred.await(resultDeferred);

    return {
      dispatchId,
      events: Stream.fromQueue(eventQueue).pipe(Stream.takeUntil((e) => e._tag === "Done")),
      inject: (i: Injection) => Queue.offer(injectionQueue, i).pipe(Effect.asVoid),
      interrupt: Fiber.interrupt(loopFiber).pipe(Effect.asVoid),
      result,
      messages: Ref.get(messagesRef),
    };
  });

// ---------------------------------------------------------------------------
// dispatchAwait — convenience when you only need the final result
// ---------------------------------------------------------------------------

export const dispatchAwait = (
  blueprint: Blueprint,
  task: string,
  options?: DispatchOptions,
): Effect.Effect<AgentResult, AgentError, LanguageModel.LanguageModel | SatelliteRing | DispatchLog> =>
  dispatch(blueprint, task, options).pipe(Effect.flatMap((handle) => handle.result));
