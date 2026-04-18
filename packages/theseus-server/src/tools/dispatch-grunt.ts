/**
 * dispatch_grunt — tool that lets an orchestrator agent delegate work to a grunt.
 *
 * The orchestrator calls this tool with a task description. The tool dispatches
 * a grunt with the configured worker blueprint, awaits the result, and returns
 * the grunt's output as a string.
 *
 * Built at runtime — closes over LanguageModel + worker Blueprint.
 * Lives in theseus-server (not theseus-tools) because it requires LLM access.
 */

import type * as Agent from "@theseus.run/core/Agent";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Grunt from "@theseus.run/core/Grunt";
import * as Tool from "@theseus.run/core/Tool";
import { Effect, Layer, Schema } from "effect";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";

// ---------------------------------------------------------------------------
// Input schema + typed failure
// ---------------------------------------------------------------------------

const Input = Schema.Struct({
  task: Schema.String.annotate({
    description: "What the grunt should accomplish. Be specific.",
  }),
});

type Input = Schema.Schema.Type<typeof Input>;

export class DispatchGruntFailure extends Schema.TaggedErrorClass<DispatchGruntFailure>()(
  "DispatchGruntFailure",
  {
    message: Schema.String,
  },
) {}

/**
 * Create a dispatch_grunt tool that delegates to a grunt with the given worker blueprint.
 *
 * The tool closes over the LanguageModel service — it must be called inside
 * an Effect that has LanguageModel provided.
 *
 * @param workerBlueprint - Blueprint for the worker grunt (tools, systemPrompt)
 */
export const makeDispatchGruntTool = (
  workerBlueprint: Agent.Blueprint,
): Effect.Effect<Tool.Any, never, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    // Capture the LanguageModel service at tool creation time
    const lm = yield* LanguageModel.LanguageModel;

    return Tool.define<Input, string, DispatchGruntFailure>({
      name: "dispatch_grunt",
      description:
        `Delegate a task to a worker grunt ("${workerBlueprint.name}"). ` +
        "The grunt has its own tools and fresh context. " +
        "Returns the grunt's final text output. Use this for work that requires file access, code exploration, or execution.",
      input: Input as unknown as Schema.Schema<Input>,
      failure: DispatchGruntFailure as unknown as Schema.Schema<DispatchGruntFailure>,
      meta: Tool.meta({ mutation: "write", capabilities: ["agent.dispatch"] }),
      execute: ({ task }) =>
        Grunt.gruntAwait(workerBlueprint, task).pipe(
          Effect.provide(
            Layer.merge(Layer.succeed(LanguageModel.LanguageModel, lm), Dispatch.Defaults),
          ),
          Effect.map((result) => result.content),
          Effect.catchTags({
            AgentInterrupted: (e) =>
              Effect.fail(
                new DispatchGruntFailure({
                  message: `Grunt interrupted: ${e.reason ?? "unknown"}`,
                }),
              ),
            AgentCycleExceeded: (e) =>
              Effect.fail(
                new DispatchGruntFailure({
                  message: `Grunt exceeded cycle cap (${e.max} iterations)`,
                }),
              ),
            AgentLLMError: (e) =>
              Effect.fail(new DispatchGruntFailure({ message: `Grunt LLM failed: ${e.message}` })),
          }),
        ),
    });
  });
