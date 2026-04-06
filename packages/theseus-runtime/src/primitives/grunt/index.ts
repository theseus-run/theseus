/**
 * Grunt — stateless agent dispatch loop, observable and injectable.
 *
 * dispatch() returns a GruntHandle immediately — the loop runs as a forked fiber.
 *
 *   handle.events    Stream<GruntEvent> — observe every state transition
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

import { Cause, Deferred, Effect, Exit, Fiber, Option, Queue, Schedule, Stream } from "effect";
import type { AgentResult } from "../agent/index.ts";
import { AgentError } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import type { LLMMessage, LLMToolCall, LLMUsage } from "../llm/provider.ts";
import { LLMErrorRetriable, LLMProvider } from "../llm/provider.ts";
import type { ToolAny } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";

// ---------------------------------------------------------------------------
// GruntEvent — observable state transitions of the dispatch loop
// ---------------------------------------------------------------------------

export type GruntEvent =
  | { readonly _tag: "Thinking";    readonly agent: string; readonly iteration: number }
  | { readonly _tag: "ToolCalling"; readonly agent: string; readonly iteration: number; readonly tool: string; readonly args: unknown }
  | { readonly _tag: "ToolResult";  readonly agent: string; readonly iteration: number; readonly tool: string; readonly content: string }
  | { readonly _tag: "Done";        readonly agent: string; readonly result: AgentResult }

// ---------------------------------------------------------------------------
// Injection — loop mutations pushed from outside
// ---------------------------------------------------------------------------

export type Injection =
  | { readonly _tag: "AppendMessages";  readonly messages: ReadonlyArray<LLMMessage> }
  | { readonly _tag: "ReplaceMessages"; readonly messages: ReadonlyArray<LLMMessage> }
  | { readonly _tag: "CollapseContext" }
  | { readonly _tag: "Interrupt";       readonly reason?: string }
  | { readonly _tag: "Redirect";        readonly task: string }

// ---------------------------------------------------------------------------
// GruntHandle — live interface to a running dispatch
// ---------------------------------------------------------------------------

export interface GruntHandle {
  /**
   * Observable event stream. Completes after Done. Never fails —
   * loop errors surface via result only.
   */
  readonly events: Stream.Stream<GruntEvent>
  /** Push an injection — processed at the start of the next iteration. */
  readonly inject: (i: Injection) => Effect.Effect<void>
  /**
   * Preemptive cancellation — kills the loop immediately, mid-call if needed.
   * result will fail with AgentError("Interrupted").
   */
  readonly interrupt: Effect.Effect<void>
  /** Await the final result. Fails with AgentError on loop failure or interrupt. */
  readonly result: Effect.Effect<AgentResult, AgentError>
}

// ---------------------------------------------------------------------------
// Default retry schedule — 3 retries, 500ms exponential jittered
// ---------------------------------------------------------------------------

export const DEFAULT_LLM_RETRY_SCHEDULE = Schedule.both(
  Schedule.exponential("500 millis").pipe(Schedule.jittered),
  Schedule.recurs(3),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const addUsage = (a: LLMUsage, b: LLMUsage): LLMUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

const tryParseArgs = (tc: LLMToolCall): unknown => {
  try {
    return JSON.parse(tc.arguments);
  } catch {
    return tc.arguments;
  }
};

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export const dispatch = (
  blueprint: Blueprint,
  task: string,
): Effect.Effect<GruntHandle, never, LLMProvider> =>
  Effect.gen(function* () {
    const maxIter = blueprint.maxIterations ?? 20;
    const zeroUsage: LLMUsage = { inputTokens: 0, outputTokens: 0 };
    const toolDefs = blueprint.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    const eventQueue = yield* Queue.unbounded<GruntEvent, Cause.Done>();
    const injectionQueue = yield* Queue.unbounded<Injection>();
    const resultDeferred = yield* Deferred.make<AgentResult, AgentError>();

    const emit = (event: GruntEvent): Effect.Effect<void> =>
      Queue.offer(eventQueue, event).pipe(Effect.asVoid);

    // -----------------------------------------------------------------------
    // drainInjections — apply all pending injections at iteration boundary.
    // Returns modified messages, or null if Interrupt was seen.
    // -----------------------------------------------------------------------

    const drainInjections = (
      messages: ReadonlyArray<LLMMessage>,
    ): Effect.Effect<ReadonlyArray<LLMMessage> | null> =>
      Effect.gen(function* () {
        let current = messages;
        let opt = yield* Queue.poll(injectionQueue);
        while (Option.isSome(opt)) {
          const inj = opt.value;
          if (inj._tag === "Interrupt") return null;
          if (inj._tag === "AppendMessages") {
            current = [...current, ...inj.messages];
          } else if (inj._tag === "ReplaceMessages") {
            current = inj.messages;
          } else if (inj._tag === "Redirect") {
            // Keep system message, replace task
            current = [
              current[0]!,
              { role: "user" as const, content: inj.task },
            ];
          }
          // CollapseContext — no-op for now
          opt = yield* Queue.poll(injectionQueue);
        }
        return current;
      });

    // -----------------------------------------------------------------------
    // runToolCall — execute a single tool call.
    // Errors become error strings (never propagates failure).
    // -----------------------------------------------------------------------

    const runToolCall = (
      tools: ReadonlyArray<ToolAny>,
      tc: LLMToolCall,
    ): Effect.Effect<{ readonly callId: string; readonly name: string; readonly content: string }, never> => {
      const tool = tools.find((t) => t.name === tc.name);
      if (!tool)
        return Effect.succeed({
          callId: tc.id,
          name: tc.name,
          content: `Error: unknown tool "${tc.name}"`,
        });

      let raw: unknown;
      try {
        raw = JSON.parse(tc.arguments);
      } catch {
        return Effect.succeed({
          callId: tc.id,
          name: tc.name,
          content: "Error: invalid JSON in tool arguments",
        });
      }

      return callTool(tool, raw).pipe(
        Effect.map((r) => r.llmContent),
        Effect.catchTags({
          ToolError: (e) => Effect.succeed(`Error: ${e.message}`),
          ToolErrorInput: (e) => Effect.succeed(`Error: ${e.message}`),
          ToolErrorOutput: (e) => Effect.succeed(`Error: ${e.message}`),
        }),
        Effect.map((content) => ({ callId: tc.id, name: tc.name, content })),
      );
    };

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
        // Lets injections and interrupts arrive between iterations.
        yield* Effect.yieldNow;

        // Drain injection queue — may modify messages or signal interrupt
        const next = yield* drainInjections(messages);
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

        yield* emit({ _tag: "Thinking", agent: blueprint.name, iteration: iterations });

        const llm = yield* LLMProvider;
        const response = yield* llm.call(next, toolDefs).pipe(
          Effect.retry({
            while: (e): e is LLMErrorRetriable => e._tag === "LLMErrorRetriable",
            schedule: DEFAULT_LLM_RETRY_SCHEDULE,
          }),
          Effect.catchTag("LLMErrorRetriable", (e) =>
            Effect.fail(
              new AgentError({ agent: blueprint.name, message: e.message, cause: e }),
            ),
          ),
          Effect.catchTag("LLMError", (e) =>
            Effect.fail(
              new AgentError({ agent: blueprint.name, message: e.message, cause: e }),
            ),
          ),
        );

        const totalUsage = addUsage(usage, response.usage);

        if (response.type === "text") return { content: response.content, usage: totalUsage };

        // Emit ALL ToolCalling events BEFORE any tool runs.
        // This gives an interrupt window before side effects happen.
        yield* Effect.all(
          response.toolCalls.map((tc) =>
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

        // Execute all tools in parallel, then emit ToolResult for each
        const results = yield* Effect.all(
          response.toolCalls.map((tc) => runToolCall(blueprint.tools, tc)),
          { concurrency: "unbounded" },
        );

        yield* Effect.all(
          results.map((r) =>
            emit({
              _tag: "ToolResult",
              agent: blueprint.name,
              iteration: iterations,
              tool: r.name,
              content: r.content,
            }),
          ),
          { concurrency: "unbounded" },
        );

        const toolMessages: ReadonlyArray<LLMMessage> = results.map((r) => ({
          role: "tool" as const,
          toolCallId: r.callId,
          content: r.content,
        }));

        return yield* loop(
          [
            ...next,
            { role: "assistant" as const, content: "", toolCalls: response.toolCalls },
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
    // Child fiber inherits parent.services (including LLMProvider) automatically.
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
      // Stream completes after Done (takeUntil) or when queue shuts down (error/interrupt)
      events: Stream.fromQueue(eventQueue).pipe(
        Stream.takeUntil((e) => e._tag === "Done"),
      ),
      inject: (i) => Queue.offer(injectionQueue, i).pipe(Effect.asVoid),
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
