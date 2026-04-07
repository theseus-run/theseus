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

import { Cause, Deferred, Effect, Exit, Fiber, Match, Option, Queue, Stream } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { AgentResult } from "../agent/index.ts";
import { AgentInterrupted, AgentCycleExceeded } from "../agent/index.ts";
import type { AgentError } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import { report } from "../agent-comm/report.ts";
import { runToolCalls, stepStream, tryParseArgs } from "./step.ts";
import type { DispatchEvent, DispatchHandle, Injection, Usage } from "./types.ts";

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
): Effect.Effect<ReadonlyArray<Prompt.MessageEncoded> | null> =>
  Effect.gen(function* () {
    let current = messages;
    let opt = yield* Queue.poll(injectionQueue);
    while (Option.isSome(opt)) {
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
): Effect.Effect<DispatchHandle, never, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const maxIter = blueprint.maxIterations ?? 20;
    const zeroUsage: Usage = { inputTokens: 0, outputTokens: 0 };

    const eventQueue = yield* Queue.unbounded<DispatchEvent, Cause.Done>();
    const injectionQueue = yield* Queue.unbounded<Injection>();
    const resultDeferred = yield* Deferred.make<AgentResult, AgentError>();

    const emit = (event: DispatchEvent): Effect.Effect<void> =>
      Queue.offer(eventQueue, event).pipe(Effect.asVoid);

    const emitAll = <T>(items: ReadonlyArray<T>, toEvent: (item: T) => DispatchEvent) =>
      Effect.all(items.map((i) => emit(toEvent(i))), { concurrency: "unbounded" });

    // -----------------------------------------------------------------------
    // loop — the dispatch loop, runs as a forked fiber
    // -----------------------------------------------------------------------

    const loop = (
      messages: ReadonlyArray<Prompt.MessageEncoded>,
      usage: Usage,
      iterations: number,
    ): Effect.Effect<AgentResult, AgentError, LanguageModel.LanguageModel> =>
      Effect.gen(function* () {
        yield* Effect.yieldNow;

        const next = yield* drainInjections(injectionQueue, messages);
        if (next === null)
          return yield* Effect.fail(
            new AgentInterrupted({ agent: blueprint.name, reason: "Interrupted via injection" }),
          );

        if (iterations >= maxIter)
          return yield* Effect.fail(
            new AgentCycleExceeded({ agent: blueprint.name, max: maxIter, usage }),
          );

        yield* emit({ _tag: "Calling", agent: blueprint.name, iteration: iterations });

        const result = yield* stepStream(next, blueprint.tools, blueprint.name, (chunk) =>
          Match.value(chunk.type).pipe(
            Match.when("text-delta", () =>
              emit({ _tag: "TextDelta", agent: blueprint.name, iteration: iterations, content: chunk.delta }),
            ),
            Match.when("reasoning-delta", () =>
              emit({ _tag: "ThinkingDelta", agent: blueprint.name, iteration: iterations, content: chunk.delta }),
            ),
            Match.orElse(() => Effect.void),
          ),
        );
        const totalUsage = addUsage(usage, result.usage);

        if (result.thinking) {
          yield* emit({ _tag: "Thinking", agent: blueprint.name, iteration: iterations, content: result.thinking });
        }

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

        const calls = yield* runToolCalls(blueprint.tools, result.toolCalls);

        yield* emitAll(calls, (c) => ({
          _tag: "ToolResult" as const,
          agent: blueprint.name,
          iteration: iterations,
          tool: c.name,
          content: c.content,
        }));

        // Build messages for next iteration (native Prompt.MessageEncoded format)
        const toolMessages: ReadonlyArray<Prompt.MessageEncoded> = calls.map((r) => ({
          role: "tool" as const,
          content: [{
            type: "tool-result" as const,
            id: r.callId,
            name: r.name,
            isFailure: false,
            result: r.content,
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
          [...next, assistantMsg, ...toolMessages],
          totalUsage,
          iterations + 1,
        );
      });

    const initialMessages: ReadonlyArray<Prompt.MessageEncoded> = [
      { role: "system", content: blueprint.systemPrompt },
      { role: "user", content: task },
    ];

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
                ? Deferred.fail(resultDeferred, new AgentInterrupted({ agent: blueprint.name, reason: "Fiber interrupted" }))
                : Deferred.failCause(resultDeferred, cause),
          }),
        ),
        Effect.ensuring(Queue.end(eventQueue)),
      ),
    );

    const result: Effect.Effect<AgentResult, AgentError> = Deferred.await(resultDeferred);

    return {
      events: Stream.fromQueue(eventQueue).pipe(Stream.takeUntil((e) => e._tag === "Done")),
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
): Effect.Effect<AgentResult, AgentError, LanguageModel.LanguageModel> =>
  dispatch(blueprint, task).pipe(Effect.flatMap((handle) => handle.result));
