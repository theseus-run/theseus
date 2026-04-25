/** @jsxImportSource @theseus.run/jsx-md */

/**
 * theseus_dispatch_grunt - dispatch a one-shot LLM worker from a runtime-owned blueprint.
 */

import { render } from "@theseus.run/jsx-md";
import { Effect, Schema } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import { BlueprintRegistry } from "../agent/index.ts";
import { DispatchDefaults } from "../dispatch/defaults.ts";
import { dispatchAwait } from "../grunt/index.ts";
import { defineTool, type Tool } from "../tool/index.ts";
import { WorkerPrompt } from "./briefing.tsx";
import { report } from "./report.ts";
import type { DispatchGruntInput } from "./types.ts";

const DispatchGruntInputSchema = Schema.Struct({
  blueprint: Schema.String.annotate({
    description: "Runtime-owned blueprint name to dispatch.",
  }),
  task: Schema.String.annotate({
    description: "What the grunt should accomplish. Be specific.",
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

export class DispatchGruntFailed extends Schema.TaggedErrorClass<DispatchGruntFailed>()(
  "DispatchGruntFailed",
  {
    reason: Schema.String,
  },
) {}

export const dispatchGruntTool: Tool<
  DispatchGruntInput,
  string,
  DispatchGruntFailed,
  BlueprintRegistry | LanguageModel.LanguageModel
> = defineTool<
  DispatchGruntInput,
  string,
  DispatchGruntFailed,
  BlueprintRegistry | LanguageModel.LanguageModel
>({
  name: "theseus_dispatch_grunt",
  description:
    "Dispatch a one-shot grunt from a runtime-owned blueprint. Provide a blueprint name, task, criteria, and context.",
  input: DispatchGruntInputSchema as unknown as Schema.Schema<DispatchGruntInput>,
  failure: DispatchGruntFailed as unknown as Schema.Schema<DispatchGruntFailed>,
  policy: { interaction: "write" },
  execute: ({ blueprint, task, criteria, context }) =>
    Effect.gen(function* () {
      const registry = yield* BlueprintRegistry;
      const workerBlueprint = yield* registry
        .get(blueprint)
        .pipe(
          Effect.mapError(
            () => new DispatchGruntFailed({ reason: `Unknown blueprint: ${blueprint}` }),
          ),
        );
      const systemPrompt = render(
        <WorkerPrompt
          basePrompt={workerBlueprint.systemPrompt}
          briefing={{
            task,
            criteria,
            ...(context !== undefined ? { context } : {}),
          }}
        />,
      );
      const briefedBlueprint = {
        ...workerBlueprint,
        systemPrompt,
        tools: [...workerBlueprint.tools, report],
      };

      const result = yield* dispatchAwait(briefedBlueprint, task).pipe(
        Effect.provide(DispatchDefaults),
        Effect.catchTags({
          AgentInterrupted: (e) =>
            Effect.fail(
              new DispatchGruntFailed({ reason: `Grunt interrupted: ${e.reason ?? "unknown"}` }),
            ),
          AgentCycleExceeded: (e) =>
            Effect.fail(
              new DispatchGruntFailed({ reason: `Grunt exceeded cycle cap (${e.max} iterations)` }),
            ),
          AgentLLMError: (e) =>
            Effect.fail(new DispatchGruntFailed({ reason: `Grunt LLM failed: ${e.message}` })),
        }),
      );

      return `[${result.result}] ${result.summary}\n\n${result.content}`;
    }),
});
