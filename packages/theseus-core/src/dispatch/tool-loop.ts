import { Effect, Match } from "effect";
import type { SatelliteActionCallback } from "../satellite/ring.ts";
import type {
  BeforeToolDecision,
  SatelliteAbort,
  SatelliteContext,
  SatelliteScope,
  ToolErrorDecision,
} from "../satellite/types.ts";
import type { Presentation, ToolAnyWith } from "../tool/index.ts";
import { presentationToText, runToolCall, tryParseArgs } from "./step.ts";
import {
  type DispatchEvent,
  DispatchToolFailed,
  type ToolCall,
  type ToolCallError,
  type ToolCallResult,
} from "./types.ts";

type Emit = (event: DispatchEvent) => Effect.Effect<void>;

const presentationResult = (
  toolCall: { id: string; name: string },
  args: unknown,
  presentation: Presentation,
): ToolCallResult => ({
  callId: toolCall.id,
  name: toolCall.name,
  args,
  presentation,
  textContent: presentationToText(presentation),
});

const toolCallingEvent = (name: string, iteration: number, toolCall: ToolCall): DispatchEvent => ({
  _tag: "ToolCalling",
  name,
  iteration,
  tool: toolCall.name,
  args: tryParseArgs(toolCall),
});

const toolResultEvent = (
  name: string,
  iteration: number,
  result: ToolCallResult,
): DispatchEvent => ({
  _tag: "ToolResult",
  name,
  iteration,
  tool: result.name,
  content: result.textContent,
  isError: result.presentation.isError ?? false,
});

const toolErrorEvent = (
  name: string,
  iteration: number,
  toolCall: ToolCall,
  error: ToolCallError,
): DispatchEvent => ({
  _tag: "ToolError",
  name,
  iteration,
  tool: toolCall.name,
  error,
});

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
      Effect.succeed(presentationResult(toolCall, tryParseArgs(toolCall), block.presentation)),
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

export const runDispatchToolCalls = <R>(input: {
  readonly dispatchId: string;
  readonly name: string;
  readonly iteration: number;
  readonly tools: ReadonlyArray<ToolAnyWith<R>>;
  readonly toolCalls: ReadonlyArray<ToolCall>;
  readonly satelliteScope: SatelliteScope<R>;
  readonly satelliteContext: SatelliteContext;
  readonly onSatelliteAction: SatelliteActionCallback;
  readonly emit: Emit;
}): Effect.Effect<ReadonlyArray<ToolCallResult>, DispatchToolFailed | SatelliteAbort, R> =>
  Effect.gen(function* () {
    yield* Effect.all(
      input.toolCalls.map((tc) => input.emit(toolCallingEvent(input.name, input.iteration, tc))),
      {
        concurrency: "unbounded",
      },
    );

    yield* input.satelliteScope.checkpoint(
      "before-tools",
      input.satelliteContext,
      input.onSatelliteAction,
    );

    const results: ToolCallResult[] = [];
    for (const toolCall of input.toolCalls) {
      const beforeAction = yield* input.satelliteScope.beforeTool(
        { tool: toolCall },
        input.satelliteContext,
        input.onSatelliteAction,
      );

      const callResult = yield* runToolWithDecision(input.tools, toolCall, beforeAction).pipe(
        Effect.catch((error: ToolCallError) =>
          input
            .emit(toolErrorEvent(input.name, input.iteration, toolCall, error))
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
          presentationResult(toolCall, callResult.args, decision.presentation),
        ),
        Match.exhaustive,
      );

      results.push(finalResult);
    }

    yield* input.satelliteScope.checkpoint(
      "after-tools",
      input.satelliteContext,
      input.onSatelliteAction,
    );

    yield* Effect.all(
      results.map((result) => input.emit(toolResultEvent(input.name, input.iteration, result))),
      {
        concurrency: "unbounded",
      },
    );

    return results;
  });
