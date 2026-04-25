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
import { Defaults, defineTool, type Tool } from "../tool/index.ts";
import { WorkerPrompt } from "./briefing.tsx";
import { report } from "./report.ts";
import { type DispatchGruntInput, DispatchGruntInputSchema } from "./types.ts";

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
> = defineTool({
  name: "theseus_dispatch_grunt",
  description:
    "Dispatch a one-shot grunt from a runtime-owned blueprint. Provide a blueprint name, task, criteria, and context.",
  input: DispatchGruntInputSchema,
  output: Defaults.TextOutput,
  failure: DispatchGruntFailed,
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
          AgentToolFailed: (e) =>
            Effect.fail(new DispatchGruntFailed({ reason: `Grunt tool failed: ${e.tool}` })),
        }),
      );

      return `[${result.result}] ${result.summary}\n\n${result.content}`;
    }),
});
