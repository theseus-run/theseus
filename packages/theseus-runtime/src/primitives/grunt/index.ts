/**
 * Grunt — stateless agent dispatch loop.
 *
 * Given a Blueprint (name + systemPrompt + tools), dispatches a task to an LLM,
 * runs its tool calls in parallel, and loops until the model produces text.
 *
 * Stateless: no history accumulates between dispatch calls.
 * Errors surface as AgentError — all LLM and tool failures are handled internally.
 *
 * Usage:
 *   const result = yield* dispatch(blueprint, "Summarise the file at /tmp/data.txt")
 *   console.log(result.content)
 */

import { Effect, Schedule } from "effect";
import type { AgentResult } from "../agent/index.ts";
import { AgentError } from "../agent/index.ts";
import type { Blueprint } from "../agent/index.ts";
import type { LLMMessage, LLMToolCall, LLMUsage } from "../llm/provider.ts";
import { LLMErrorRetriable, LLMProvider } from "../llm/provider.ts";
import type { ToolAny } from "../tool/index.ts";
import { callTool } from "../tool/run.ts";

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

/** Execute a single tool call, converting all errors to error strings for the LLM. */
const executeToolCall = (
  tools: ReadonlyArray<ToolAny>,
  tc: LLMToolCall,
): Effect.Effect<LLMMessage, never> => {
  const tool = tools.find((t) => t.name === tc.name);
  if (!tool)
    return Effect.succeed({
      role: "tool",
      toolCallId: tc.id,
      content: `Error: unknown tool "${tc.name}"`,
    });

  let raw: unknown;
  try {
    raw = JSON.parse(tc.arguments);
  } catch {
    return Effect.succeed({
      role: "tool",
      toolCallId: tc.id,
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
    Effect.map((content) => ({ role: "tool" as const, toolCallId: tc.id, content })),
  );
};

// ---------------------------------------------------------------------------
// dispatch — main entry point
// ---------------------------------------------------------------------------

/**
 * Dispatch a task to an LLM agent defined by the blueprint.
 *
 * Stateless: each call starts a fresh conversation.
 * Loop: text response → return; tool_calls → execute in parallel → append → repeat.
 * Cycle cap: AgentError when iterations reach blueprint.maxIterations (default 20).
 */
export const dispatch = (
  blueprint: Blueprint,
  task: string,
): Effect.Effect<AgentResult, AgentError, LLMProvider> => {
  const maxIter = blueprint.maxIterations ?? 20;
  const toolDefs = blueprint.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  const zeroUsage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

  const loop = (
    messages: ReadonlyArray<LLMMessage>,
    usage: LLMUsage,
    iterations: number,
  ): Effect.Effect<AgentResult, AgentError, LLMProvider> =>
    Effect.gen(function* () {
      if (iterations >= maxIter)
        return yield* Effect.fail(
          new AgentError({
            agent: blueprint.name,
            message: `Cycle cap exceeded (${maxIter} iterations)`,
          }),
        );

      const llm = yield* LLMProvider;
      const response = yield* llm.call(messages, toolDefs).pipe(
        Effect.retry({
          while: (e): e is LLMErrorRetriable => e._tag === "LLMErrorRetriable",
          schedule: DEFAULT_LLM_RETRY_SCHEDULE,
        }),
        Effect.catchTag("LLMErrorRetriable", (e) =>
          Effect.fail(new AgentError({ agent: blueprint.name, message: e.message, cause: e })),
        ),
        Effect.catchTag("LLMError", (e) =>
          Effect.fail(new AgentError({ agent: blueprint.name, message: e.message, cause: e })),
        ),
      );

      const totalUsage = addUsage(usage, response.usage);
      if (response.type === "text") return { content: response.content, usage: totalUsage };

      const toolMessages = yield* Effect.all(
        response.toolCalls.map((tc) => executeToolCall(blueprint.tools, tc)),
        { concurrency: "unbounded" },
      );

      return yield* loop(
        [
          ...messages,
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

  return loop(initialMessages, zeroUsage, 0);
};
