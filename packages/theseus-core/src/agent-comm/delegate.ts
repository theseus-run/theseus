/**
 * theseus_delegate — orchestrator tool that dispatches a worker with a structured briefing.
 *
 * Uses jsx-md render() with programmatic VNode construction (not JSX syntax)
 * to avoid cross-package jsx-dev-runtime resolution issues in bun workspaces.
 */

import { Bold, Code, H2, Hr, Li, Md, P, render, Ul } from "@theseus.run/jsx-md";
import { Effect, Layer, Schema } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type { Blueprint } from "../agent/index.ts";
import { Capsule } from "../capsule/index.ts";
import { DispatchDefaults } from "../dispatch/defaults.ts";
import { gruntAwait } from "../grunt/index.ts";
import { defineTool, meta, type Tool } from "../tool/index.ts";
import { report } from "./report.ts";
import type { DelegateInput } from "./types.ts";

/** Render a worker's full system prompt with briefing section using jsx-md primitives. */
const renderWorkerPrompt = (basePrompt: string, briefing: DelegateInput): string =>
  render([
    Md({ children: basePrompt }),
    Hr({}),
    H2({ children: "Briefing" }),
    P({ children: [Bold({ children: "Task:" }), " ", briefing.task] }),
    ...(briefing.criteria.length > 0
      ? [
          P({ children: [Bold({ children: "Done when:" })] }),
          Ul({ children: briefing.criteria.map((c) => Li({ children: c })) }),
        ]
      : []),
    ...(briefing.context
      ? [P({ children: [Bold({ children: "Context:" })] }), P({ children: briefing.context })]
      : []),
    Hr({}),
    P({ children: ["When done, call the ", Code({ children: "theseus_report" }), " tool:"] }),
    Ul({
      children: [
        Li({
          children: [
            Bold({ children: "success" }),
            " — task completed, content is the deliverable",
          ],
        }),
        Li({
          children: [
            Bold({ children: "error" }),
            " — not completed but you found actionable information",
          ],
        }),
        Li({
          children: [Bold({ children: "defect" }), " — infrastructure broken, tools not working"],
        }),
      ],
    }),
  ]);

const DelegateInputSchema = Schema.Struct({
  task: Schema.String.annotate({
    description: "What the worker should accomplish. Be specific.",
  }),
  criteria: Schema.Array(Schema.String).annotate({
    description: "How we know the task is done.",
  }),
  context: Schema.optional(
    Schema.String.annotate({
      description: "File paths, inline data, or references.",
    }),
  ),
});

/** Typed failure for delegate — worker didn't complete successfully. */
export class DelegateFailed extends Schema.TaggedErrorClass<DelegateFailed>()("DelegateFailed", {
  reason: Schema.String,
}) {}

/**
 * Create a theseus_delegate tool for dispatching workers.
 *
 * Closes over LanguageModel + Capsule + worker Blueprint.
 * The worker automatically gets the theseus_report tool added to its tools.
 */
export const makeDelegate = (
  workerBlueprint: Blueprint,
): Effect.Effect<
  Tool<DelegateInput, string, DelegateFailed, never>,
  never,
  LanguageModel.LanguageModel | Capsule
> =>
  Effect.gen(function* () {
    const lm = yield* LanguageModel.LanguageModel;
    const capsule = yield* Capsule;

    return defineTool<DelegateInput, string, DelegateFailed>({
      name: "theseus_delegate",
      description:
        `Delegate a task to worker "${workerBlueprint.name}". ` +
        "Provide a clear task, measurable criteria, and relevant context. " +
        "The worker has its own tools and fresh context. " +
        "Returns the worker's structured result.",
      input: DelegateInputSchema as unknown as Schema.Schema<DelegateInput>,
      failure: DelegateFailed as unknown as Schema.Schema<DelegateFailed>,
      meta: meta({ mutation: "write", capabilities: ["agent.dispatch"] }),
      execute: (input) =>
        Effect.gen(function* () {
          const briefingMd = renderWorkerPrompt(workerBlueprint.systemPrompt, input);

          yield* capsule.artifact(`briefing-${Date.now()}`, briefingMd);

          yield* capsule.log({
            type: "agent.dispatch",
            by: "orchestrator",
            data: { agent: workerBlueprint.name, task: input.task, criteria: input.criteria },
          });

          const briefedBlueprint: Blueprint = {
            ...workerBlueprint,
            systemPrompt: briefingMd,
            tools: [...workerBlueprint.tools, report],
          };

          const agentResult = yield* gruntAwait(briefedBlueprint, input.task).pipe(
            Effect.provide(
              Layer.merge(Layer.succeed(LanguageModel.LanguageModel, lm), DispatchDefaults),
            ),
            Effect.catchTags({
              AgentInterrupted: (e) =>
                Effect.fail(
                  new DelegateFailed({ reason: `Worker interrupted: ${e.reason ?? "unknown"}` }),
                ),
              AgentCycleExceeded: (e) =>
                Effect.fail(
                  new DelegateFailed({ reason: `Worker exceeded cycle cap (${e.max} iterations)` }),
                ),
              AgentLLMError: (e) =>
                Effect.fail(new DelegateFailed({ reason: `Worker LLM failed: ${e.message}` })),
            }),
          );

          yield* capsule.log({
            type: "agent.result",
            by: workerBlueprint.name,
            data: { result: agentResult.result, summary: agentResult.summary },
          });

          return `[${agentResult.result}] ${agentResult.summary}\n\n${agentResult.content}`;
        }),
    });
  });
