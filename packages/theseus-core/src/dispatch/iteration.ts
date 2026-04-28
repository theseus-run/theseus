import { Effect, Match } from "effect";
import type * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type { SatelliteActionCallback } from "../satellite/ring.ts";
import type {
  AfterCallDecision,
  BeforeCallDecision,
  CheckpointDecision,
  SatelliteAbort,
  SatelliteContext,
  SatelliteScope,
} from "../satellite/types.ts";
import { Cortex } from "./cortex.ts";
import * as DispatchEvents from "./events.ts";
import { assistantToolMessage, finalAssistantMessages, toolResultMessages } from "./messages.ts";
import { step } from "./step.ts";
import { runDispatchToolCalls } from "./tool-loop.ts";
import {
  DispatchCycleExceeded,
  type DispatchError,
  type DispatchEvent,
  type DispatchOutput,
  type DispatchSpec,
  type StepResult,
  type ToolCallResult,
  type Usage,
} from "./types.ts";

type Emit = (event: DispatchEvent) => Effect.Effect<void>;

export interface IterationInput<R> {
  readonly dispatchId: string;
  readonly spec: DispatchSpec<R>;
  readonly task: string;
  readonly maxIterations: number;
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
  readonly usage: Usage;
  readonly iteration: number;
  readonly satelliteScope: SatelliteScope<R>;
  readonly emit: Emit;
}

export type IterationResult =
  | {
      readonly _tag: "Finished";
      readonly output: DispatchOutput;
    }
  | {
      readonly _tag: "Continue";
      readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
      readonly usage: Usage;
      readonly iteration: number;
    };

type StepRoute =
  | {
      readonly _tag: "Finish";
      readonly result: StepResult;
    }
  | {
      readonly _tag: "UseTools";
      readonly result: StepResult;
    };

const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

const ensureWithinCycleLimit = (input: {
  readonly dispatchId: string;
  readonly name: string;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly usage: Usage;
}): Effect.Effect<void, DispatchCycleExceeded> =>
  input.iteration >= input.maxIterations
    ? Effect.fail(
        new DispatchCycleExceeded({
          dispatchId: input.dispatchId,
          name: input.name,
          max: input.maxIterations,
          usage: input.usage,
        }),
      )
    : Effect.void;

const checkpointMessages = (
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  decision: CheckpointDecision,
): ReadonlyArray<Prompt.MessageEncoded> =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => messages),
    Match.tag("TransformMessages", ({ messages }) => messages),
    Match.exhaustive,
  );

const beforeCallMessages = (
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  decision: BeforeCallDecision,
): ReadonlyArray<Prompt.MessageEncoded> =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => messages),
    Match.tag("TransformMessages", ({ messages }) => messages),
    Match.exhaustive,
  );

const afterCallResult = (rawResult: StepResult, decision: AfterCallDecision): StepResult =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => rawResult),
    Match.tag("TransformStepResult", ({ stepResult }) => stepResult),
    Match.exhaustive,
  );

const emitStepContent = (input: {
  readonly name: string;
  readonly iteration: number;
  readonly result: StepResult;
  readonly emit: Emit;
}): Effect.Effect<void> =>
  Effect.forEach(
    [
      ...(input.result.thinking
        ? [DispatchEvents.thinking(input.name, input.iteration, input.result.thinking)]
        : []),
      ...(input.result.content
        ? [DispatchEvents.text(input.name, input.iteration, input.result.content)]
        : []),
    ],
    input.emit,
    { discard: true },
  );

const routeStepResult = (result: StepResult): StepRoute =>
  result.toolCalls.length === 0 ? { _tag: "Finish", result } : { _tag: "UseTools", result };

const finishIteration = (input: {
  readonly dispatchId: string;
  readonly name: string;
  readonly callMessages: ReadonlyArray<Prompt.MessageEncoded>;
  readonly result: StepResult;
  readonly usage: Usage;
}): IterationResult => ({
  _tag: "Finished",
  output: {
    dispatchId: input.dispatchId,
    name: input.name,
    content: input.result.content,
    messages: finalAssistantMessages(input.callMessages, input.result.content),
    usage: input.usage,
  },
});

const continueIteration = (input: {
  readonly callMessages: ReadonlyArray<Prompt.MessageEncoded>;
  readonly result: StepResult;
  readonly toolResults: ReadonlyArray<ToolCallResult>;
  readonly usage: Usage;
  readonly iteration: number;
}): IterationResult => ({
  _tag: "Continue",
  messages: [
    ...input.callMessages,
    assistantToolMessage(input.result.content, input.result.toolCalls),
    ...toolResultMessages(input.toolResults),
  ],
  usage: input.usage,
  iteration: input.iteration + 1,
});

export const runDispatchIteration = <R>({
  dispatchId,
  spec,
  task,
  maxIterations,
  messages,
  usage,
  iteration,
  satelliteScope,
  emit,
}: IterationInput<R>): Effect.Effect<
  IterationResult,
  DispatchError | SatelliteAbort,
  R | LanguageModel.LanguageModel | Cortex
> =>
  Effect.gen(function* () {
    yield* ensureWithinCycleLimit({
      dispatchId,
      name: spec.name,
      iteration,
      maxIterations,
      usage,
    });

    const satelliteContext: SatelliteContext = { dispatchId, name: spec.name, task, iteration };
    const onSatelliteAction: SatelliteActionCallback = (satellite, phase, action) =>
      emit(DispatchEvents.satelliteAction(spec.name, iteration, satellite, phase, action));

    const iterationStartDecision = yield* satelliteScope.checkpoint(
      "iteration-start",
      satelliteContext,
      onSatelliteAction,
    );
    const afterCheckpoint = checkpointMessages(messages, iterationStartDecision);

    const cortex = yield* Cortex;
    const frame = yield* cortex.render({
      history: afterCheckpoint,
      dispatch: {
        dispatchId,
        name: spec.name,
        task,
        iteration,
      },
    });
    yield* emit(DispatchEvents.cortexRendered(spec.name, iteration, afterCheckpoint.length, frame));

    const beforeCallDecision = yield* satelliteScope.beforeCall(
      { messages: frame.messages },
      satelliteContext,
      onSatelliteAction,
    );
    const callMessages = beforeCallMessages(frame.messages, beforeCallDecision);

    yield* emit(DispatchEvents.calling(spec.name, iteration));

    const rawResult = yield* step(callMessages, spec.tools, dispatchId, spec.name).pipe(
      Effect.withSpan("llm-call", {
        attributes: { "llm.name": spec.name, "llm.iteration": iteration },
      }),
    );
    const totalUsage = addUsage(usage, rawResult.usage);
    yield* emitStepContent({ name: spec.name, iteration, result: rawResult, emit });

    const afterCallDecision = yield* satelliteScope.afterCall(
      { stepResult: rawResult },
      satelliteContext,
      onSatelliteAction,
    );
    const result = afterCallResult(rawResult, afterCallDecision);

    return yield* Match.value(routeStepResult(result)).pipe(
      Match.tag("Finish", ({ result }) =>
        Effect.succeed(
          finishIteration({
            dispatchId,
            name: spec.name,
            callMessages,
            result,
            usage: totalUsage,
          }),
        ),
      ),
      Match.tag("UseTools", ({ result }) =>
        runDispatchToolCalls<R>({
          dispatchId,
          name: spec.name,
          iteration,
          tools: spec.tools,
          toolCalls: result.toolCalls,
          satelliteScope,
          satelliteContext,
          onSatelliteAction,
          emit,
        }).pipe(
          Effect.map((toolResults) =>
            continueIteration({
              callMessages,
              result,
              toolResults,
              usage: totalUsage,
              iteration,
            }),
          ),
        ),
      ),
      Match.exhaustive,
    );
  });
