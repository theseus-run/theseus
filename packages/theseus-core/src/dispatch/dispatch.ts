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
 * Two interruption modes:
 *   cooperative  → inject({ _tag: "Interrupt" }) — finishes current op, stops at boundary
 *   preemptive   → handle.interrupt — kills immediately, even inside an LLM call
 *
 * ToolCalling events are emitted BEFORE tools execute — gives interrupt a window
 * before any side effects happen.
 *
 * dispatchAwait — convenience for callers that only care about the result.
 */

import { Cause, Deferred, Effect, Exit, Fiber, Match, Option, Queue, Stream } from "effect";
import type { AgentResult } from "../agent/index.ts";
import { AgentError } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import type { LLMMessage, LLMUsage } from "../llm/provider.ts";
import { LLMProvider } from "../llm/provider.ts";
import { runToolCalls, stepStream, tryParseArgs } from "./step.ts";
import type { DispatchEvent, DispatchHandle, Injection } from "./types.ts";

// ---------------------------------------------------------------------------
// addUsage — accumulate token counts
// ---------------------------------------------------------------------------

const addUsage = (a: LLMUsage, b: LLMUsage): LLMUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

// ---------------------------------------------------------------------------
// drainInjections — apply all pending injections at iteration boundary.
// Returns modified messages, or null if Interrupt was seen.
// ---------------------------------------------------------------------------

const drainInjections = (
  injectionQueue: Queue.Queue<Injection>,
  messages: ReadonlyArray<LLMMessage>,
): Effect.Effect<ReadonlyArray<LLMMessage> | null> =>
  Effect.gen(function* () {
    let current: ReadonlyArray<LLMMessage> | null = messages;
    let opt = yield* Queue.poll(injectionQueue);
    while (Option.isSome(opt)) {
      current = Match.value(opt.value).pipe(
        Match.tag("Interrupt", () => null),
        Match.tag("AppendMessages", (i) => [...current!, ...i.messages]),
        Match.tag("ReplaceMessages", (i) => i.messages),
        Match.tag("Redirect", (i) => [
          current![0] ?? { role: "system" as const, content: "" },
          { role: "user" as const, content: i.task },
        ]),
        Match.tag("CollapseContext", () => current), // no-op
        Match.exhaustive,
      );
      if (current === null) return null;
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
): Effect.Effect<DispatchHandle, never, LLMProvider> =>
  Effect.gen(function* () {
    const maxIter = blueprint.maxIterations ?? 20;
    const zeroUsage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

    const eventQueue = yield* Queue.unbounded<DispatchEvent, Cause.Done>();
    const injectionQueue = yield* Queue.unbounded<Injection>();
    const resultDeferred = yield* Deferred.make<AgentResult, AgentError>();

    const emit = (event: DispatchEvent): Effect.Effect<void> =>
      Queue.offer(eventQueue, event).pipe(Effect.asVoid);

    // -----------------------------------------------------------------------
    // loop — the dispatch loop, runs as a forked fiber
    // -----------------------------------------------------------------------

    const loop = (
      messages: ReadonlyArray<LLMMessage>,
      usage: LLMUsage,
      iterations: number,
    ): Effect.Effect<AgentResult, AgentError, LLMProvider> =>
      Effect.gen(function* () {
        // Yield to the scheduler at each iteration boundary.
        yield* Effect.yieldNow;

        // Drain injection queue
        const next = yield* drainInjections(injectionQueue, messages);
        if (next === null)
          return yield* Effect.fail(
            new AgentError({
              agent: blueprint.name,
              message: "Interrupted via injection",
            }),
          );

        if (iterations >= maxIter)
          return yield* Effect.fail(
            new AgentError({
              agent: blueprint.name,
              message: `Cycle cap exceeded (${maxIter} iterations)`,
            }),
          );

        yield* emit({ _tag: "Calling", agent: blueprint.name, iteration: iterations });

        // stepStream() emits text/thinking deltas as they arrive, falls back to non-streaming
        const result = yield* stepStream(next, blueprint.tools, blueprint.name, (chunk) =>
          Match.value(chunk).pipe(
            Match.when({ type: "text_delta" }, (c) =>
              emit({ _tag: "TextDelta", agent: blueprint.name, iteration: iterations, content: c.content }),
            ),
            Match.when({ type: "thinking_delta" }, (c) =>
              emit({ _tag: "ThinkingDelta", agent: blueprint.name, iteration: iterations, content: c.content }),
            ),
            Match.when({ type: "done" }, () => Effect.void),
            Match.exhaustive,
          ),
        );
        const totalUsage = addUsage(usage, result.usage);

        // Emit full thinking content (from non-streaming fallback or accumulated)
        if (result.thinking) {
          yield* emit({ _tag: "Thinking", agent: blueprint.name, iteration: iterations, content: result.thinking });
        }

        if (result._tag === "text") return { content: result.content, usage: totalUsage };

        // Emit ALL ToolCalling events BEFORE any tool runs.
        // This gives an interrupt window before side effects happen.
        yield* Effect.all(
          result.toolCalls.map((tc) =>
            emit({
              _tag: "ToolCalling",
              agent: blueprint.name,
              iteration: iterations,
              tool: tc.name,
              args: tryParseArgs(tc),
            }),
          ),
          { concurrency: "unbounded" },
        );

        // Execute all tools in parallel
        const calls = yield* runToolCalls(blueprint.tools, result.toolCalls);

        // Emit ToolResult for each completed tool
        yield* Effect.all(
          calls.map((c) =>
            emit({
              _tag: "ToolResult",
              agent: blueprint.name,
              iteration: iterations,
              tool: c.name,
              content: c.content,
            }),
          ),
          { concurrency: "unbounded" },
        );

        // Build messages for next iteration
        const toolMessages: ReadonlyArray<LLMMessage> = calls.map((r) => ({
          role: "tool" as const,
          toolCallId: r.callId,
          content: r.content,
        }));

        return yield* loop(
          [
            ...next,
            { role: "assistant" as const, content: "", toolCalls: result.toolCalls },
            ...toolMessages,
          ],
          totalUsage,
          iterations + 1,
        );
      });

    const initialMessages: ReadonlyArray<LLMMessage> = [
      { role: "system", content: blueprint.systemPrompt },
      { role: "user", content: task },
    ];

    // Fork the loop. onExit writes the result into resultDeferred.
    const loopFiber = yield* Effect.forkDetach({ startImmediately: true })(
      loop(initialMessages, zeroUsage, 0).pipe(
        Effect.tap((result) =>
          emit({ _tag: "Done", agent: blueprint.name, result }),
        ),
        Effect.onExit((exit) =>
          Exit.match(exit, {
            onSuccess: (result) => Deferred.succeed(resultDeferred, result),
            onFailure: (cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Deferred.fail(
                    resultDeferred,
                    new AgentError({ agent: blueprint.name, message: "Interrupted" }),
                  )
                : Deferred.failCause(resultDeferred, cause),
          }),
        ),
        Effect.ensuring(Queue.end(eventQueue)),
      ),
    );

    const result: Effect.Effect<AgentResult, AgentError> = Deferred.await(resultDeferred);

    return {
      events: Stream.fromQueue(eventQueue).pipe(
        Stream.takeUntil((e) => e._tag === "Done"),
      ),
      inject: (i: Injection) => Queue.offer(injectionQueue, i).pipe(Effect.asVoid),
      interrupt: Fiber.interrupt(loopFiber).pipe(Effect.asVoid),
      result,
    };
  });

// ---------------------------------------------------------------------------
// dispatchAwait — convenience when you only need the final result
// ---------------------------------------------------------------------------

export const dispatchAwait = (
  blueprint: Blueprint,
  task: string,
): Effect.Effect<AgentResult, AgentError, LLMProvider> =>
  dispatch(blueprint, task).pipe(Effect.flatMap((handle) => handle.result));
