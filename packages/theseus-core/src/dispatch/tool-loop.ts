import { Effect, Match } from "effect";
import type { SatelliteActionCallback } from "../satellite/ring.ts";
import type {
  BeforeToolDecision,
  CheckpointDecision,
  SatelliteAbort,
  SatelliteContext,
  SatelliteScope,
  ToolErrorDecision,
} from "../satellite/types.ts";
import { SatelliteAbort as SatelliteAbortError } from "../satellite/types.ts";
import type { ToolAnyWith } from "../tool/index.ts";
import type { DispatchControlGate } from "./control.ts";
import * as DispatchEvents from "./events.ts";
import { runToolCall, tryParseArgs } from "./step.ts";
import {
  type DispatchError,
  type DispatchEvent,
  DispatchToolFailed,
  type ToolCall,
  type ToolCallError,
  type ToolCallResult,
} from "./types.ts";

type Emit = (event: DispatchEvent) => Effect.Effect<void>;

export type ToolExecutionBatch =
  | {
      readonly mode: "sequential";
      readonly toolCalls: readonly [ToolCall];
    }
  | {
      readonly mode: "parallel-safe";
      readonly toolCalls: ReadonlyArray<ToolCall>;
    }
  | {
      readonly mode: "exclusive";
      readonly toolCalls: readonly [ToolCall];
    };

const executionModeFor = <R>(
  tools: ReadonlyArray<ToolAnyWith<R>>,
  toolCall: ToolCall,
): ToolExecutionBatch["mode"] =>
  tools.find((tool) => tool.name === toolCall.name)?.execution.mode ?? "sequential";

export const planToolExecution = <R>(
  tools: ReadonlyArray<ToolAnyWith<R>>,
  toolCalls: ReadonlyArray<ToolCall>,
): ReadonlyArray<ToolExecutionBatch> => {
  const batches: ToolExecutionBatch[] = [];
  let parallelBatch: ToolCall[] = [];

  const flushParallelBatch = () => {
    if (parallelBatch.length > 0) {
      batches.push({ mode: "parallel-safe", toolCalls: parallelBatch });
      parallelBatch = [];
    }
  };

  for (const toolCall of toolCalls) {
    const mode = executionModeFor(tools, toolCall);
    if (mode === "parallel-safe") {
      parallelBatch.push(toolCall);
      continue;
    }

    flushParallelBatch();
    batches.push({ mode, toolCalls: [toolCall] });
  }

  flushParallelBatch();
  return batches;
};

const runToolWithDecision = <R>(
  tools: ReadonlyArray<ToolAnyWith<R>>,
  toolCall: ToolCall,
  decision: BeforeToolDecision,
): Effect.Effect<ToolCallResult, ToolCallError, R> =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => runToolCall(tools, toolCall)),
    Match.tag("ModifyArgs", (modify) =>
      runToolCall(tools, {
        ...toolCall,
        arguments: JSON.stringify(modify.args),
      }),
    ),
    Match.tag("BlockTool", (block) =>
      Effect.succeed(
        DispatchEvents.resultFromPresentation(toolCall, tryParseArgs(toolCall), block.presentation),
      ),
    ),
    Match.exhaustive,
  );

const recoverToolError = (
  input: {
    readonly dispatchId: string;
    readonly name: string;
  },
  toolCall: ToolCall,
  error: ToolCallError,
  decision: ToolErrorDecision,
): Effect.Effect<ToolCallResult, DispatchToolFailed> =>
  Match.value(decision).pipe(
    Match.tag("Pass", () =>
      Effect.fail(
        new DispatchToolFailed({
          dispatchId: input.dispatchId,
          name: input.name,
          tool: toolCall.name,
          error,
        }),
      ),
    ),
    Match.tag("RecoverToolError", (recover) => Effect.succeed(recover.result)),
    Match.exhaustive,
  );

const requireObservationCheckpoint = (
  checkpoint: "before-tools" | "after-tools",
  decision: CheckpointDecision,
): Effect.Effect<void, SatelliteAbort> =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => Effect.void),
    Match.tag("TransformMessages", () =>
      Effect.fail(
        new SatelliteAbortError({
          satellite: "dispatch",
          reason: `Checkpoint "${checkpoint}" is observation-only and cannot transform messages`,
        }),
      ),
    ),
    Match.exhaustive,
  );

export const runDispatchToolCalls = <R>(input: {
  readonly dispatchId: string;
  readonly name: string;
  readonly iteration: number;
  readonly tools: ReadonlyArray<ToolAnyWith<R>>;
  readonly toolCalls: ReadonlyArray<ToolCall>;
  readonly controlGate: DispatchControlGate;
  readonly satelliteScope: SatelliteScope<R>;
  readonly satelliteContext: SatelliteContext;
  readonly onSatelliteAction: SatelliteActionCallback;
  readonly emit: Emit;
}): Effect.Effect<ReadonlyArray<ToolCallResult>, DispatchError | SatelliteAbort, R> =>
  Effect.gen(function* () {
    yield* Effect.forEach(
      input.toolCalls,
      (tc) => input.emit(DispatchEvents.toolCalling(input.name, input.iteration, tc)),
      { discard: true },
    );

    const beforeTools = yield* input.satelliteScope.checkpoint(
      "before-tools",
      input.satelliteContext,
      input.onSatelliteAction,
    );
    yield* requireObservationCheckpoint("before-tools", beforeTools);

    const results: ToolCallResult[] = [];
    const batches = planToolExecution(input.tools, input.toolCalls);

    // Planning is explicit now so a future scheduler can parallelize only
    // parallel-safe batches after satellite hook ordering is hardened.
    for (const batch of batches) {
      yield* input.controlGate.awaitOpen;
      for (const toolCall of batch.toolCalls) {
        yield* input.controlGate.awaitOpen;
        const beforeAction = yield* input.satelliteScope.beforeTool(
          { tool: toolCall },
          input.satelliteContext,
          input.onSatelliteAction,
        );

        const callResult = yield* runToolWithDecision(input.tools, toolCall, beforeAction).pipe(
          Effect.catch((error: ToolCallError) =>
            input
              .emit(DispatchEvents.toolError(input.name, input.iteration, toolCall, error))
              .pipe(
                Effect.flatMap(() =>
                  input.satelliteScope
                    .toolError(
                      { tool: toolCall, error },
                      input.satelliteContext,
                      input.onSatelliteAction,
                    )
                    .pipe(
                      Effect.flatMap((decision) =>
                        recoverToolError(
                          { dispatchId: input.dispatchId, name: input.name },
                          toolCall,
                          error,
                          decision,
                        ),
                      ),
                    ),
                ),
              ),
          ),
        );

        const afterAction = yield* input.satelliteScope.afterTool(
          { tool: toolCall, result: callResult },
          input.satelliteContext,
          input.onSatelliteAction,
        );

        const finalResult = Match.value(afterAction).pipe(
          Match.tag("Pass", () => callResult),
          Match.tag("ReplaceToolResult", (decision) =>
            DispatchEvents.resultFromPresentation(toolCall, callResult.args, decision.presentation),
          ),
          Match.exhaustive,
        );

        results.push(finalResult);
      }
    }

    const afterTools = yield* input.satelliteScope.checkpoint(
      "after-tools",
      input.satelliteContext,
      input.onSatelliteAction,
    );
    yield* requireObservationCheckpoint("after-tools", afterTools);

    yield* Effect.forEach(
      results,
      (result) => input.emit(DispatchEvents.toolResult(input.name, input.iteration, result)),
      { discard: true },
    );

    return results;
  });
