/**
 * SatelliteRing — ordered dispatch middleware composition.
 *
 * The ring is static configuration. `openScope` creates one live
 * SatelliteScope per dispatch; all satellite state is scoped to that dispatch.
 */

import { Context, Effect, Layer, Match, Ref } from "effect";
import { toolRecovery } from "./tool-recovery.ts";
import type {
  AfterCall,
  AfterCallDecision,
  AfterTool,
  AfterToolDecision,
  BeforeCall,
  BeforeCallDecision,
  BeforeTool,
  BeforeToolDecision,
  CheckpointDecision,
  SatelliteAbort,
  SatelliteAny,
  SatelliteContext,
  SatelliteDecision,
  SatelliteRequirements,
  SatelliteScope,
  SatelliteStartContext,
  ToolError,
  ToolErrorDecision,
} from "./types.ts";
import { Pass, SatelliteAbort as SatelliteAbortError } from "./types.ts";

export type SatelliteActionCallback = (
  satellite: string,
  phase: string,
  action: string,
) => Effect.Effect<void>;

export interface SatelliteRingService<R = never> {
  readonly openScope: (ctx: SatelliteStartContext) => Effect.Effect<SatelliteScope<R>, never, R>;
}

export class SatelliteRing extends Context.Service<SatelliteRing, SatelliteRingService<unknown>>()(
  "SatelliteRing",
) {}

const isTerminalDecision = (decision: SatelliteDecision): boolean =>
  decision._tag === "BlockTool" || decision._tag === "RecoverToolError";

const phaseName = (phase: string) => phase;

const isCheckpointDecision = (decision: SatelliteDecision): decision is CheckpointDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

const isBeforeCallDecision = (decision: SatelliteDecision): decision is BeforeCallDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => true),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

const isAfterCallDecision = (decision: SatelliteDecision): decision is AfterCallDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => true),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

const isBeforeToolDecision = (decision: SatelliteDecision): decision is BeforeToolDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => true),
    Match.tag("BlockTool", () => true),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

const isAfterToolDecision = (decision: SatelliteDecision): decision is AfterToolDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => true),
    Match.tag("RecoverToolError", () => false),
    Match.exhaustive,
  );

const isToolErrorDecision = (decision: SatelliteDecision): decision is ToolErrorDecision =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => true),
    Match.tag("TransformMessages", () => false),
    Match.tag("TransformStepResult", () => false),
    Match.tag("ModifyArgs", () => false),
    Match.tag("BlockTool", () => false),
    Match.tag("ReplaceToolResult", () => false),
    Match.tag("RecoverToolError", () => true),
    Match.exhaustive,
  );

type StateCell = {
  readonly name: string;
  readonly ref: Ref.Ref<unknown>;
  readonly satellite: SatelliteAny;
};

const closeCells = (cells: ReadonlyArray<StateCell>): Effect.Effect<void, never, unknown> =>
  Effect.forEach(
    cells,
    (cell) =>
      Effect.gen(function* () {
        if (!cell.satellite.close) return;
        const state = yield* Ref.get(cell.ref);
        yield* cell.satellite.close(state);
      }),
    { discard: true },
  );

const runHook = <Phase, Decision extends SatelliteDecision>(
  cells: ReadonlyArray<StateCell>,
  phase: Phase,
  phaseLabel: string,
  ctx: SatelliteContext,
  getHook: (
    satellite: SatelliteAny,
  ) =>
    | ((
        phase: Phase,
        ctx: SatelliteContext,
        state: unknown,
      ) => Effect.Effect<
        { readonly decision: Decision; readonly state: unknown },
        SatelliteAbort,
        unknown
      >)
    | undefined,
  isDecision: (decision: SatelliteDecision) => decision is Decision,
  applyDecision: (phase: Phase, decision: Decision) => Phase,
  onAction?: SatelliteActionCallback,
): Effect.Effect<Decision, SatelliteAbort, unknown> =>
  Effect.gen(function* () {
    let currentPhase = phase;
    let lastDecision: Decision = Pass as Decision;

    for (const cell of cells) {
      const hook = getHook(cell.satellite);
      if (!hook) continue;

      const state = yield* Ref.get(cell.ref);
      const { decision, state: nextState } = yield* hook(currentPhase, ctx, state);
      yield* Ref.set(cell.ref, nextState);

      if (!isDecision(decision)) {
        return yield* Effect.fail(
          new SatelliteAbortError({
            satellite: cell.name,
            reason: `Invalid ${phaseLabel} decision: ${decision._tag}`,
          }),
        );
      }

      if (decision._tag === "Pass") continue;
      if (onAction) yield* onAction(cell.name, phaseName(phaseLabel), decision._tag);

      lastDecision = decision;
      if (isTerminalDecision(decision)) break;
      currentPhase = applyDecision(currentPhase, decision);
    }

    return lastDecision;
  });

const applyCheckpointDecision = <Phase extends string>(
  phase: Phase,
  _decision: CheckpointDecision,
): Phase => phase;

const applyBeforeCallDecision = (phase: BeforeCall, decision: BeforeCallDecision): BeforeCall =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => phase),
    Match.tag("TransformMessages", (d) => ({ messages: d.messages })),
    Match.exhaustive,
  );

const applyAfterCallDecision = (phase: AfterCall, decision: AfterCallDecision): AfterCall =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => phase),
    Match.tag("TransformStepResult", (d) => ({ stepResult: d.stepResult })),
    Match.exhaustive,
  );

const applyBeforeToolDecision = (phase: BeforeTool, decision: BeforeToolDecision): BeforeTool =>
  Match.value(decision).pipe(
    Match.tag("Pass", () => phase),
    Match.tag("ModifyArgs", (d) => ({
      tool: { ...phase.tool, arguments: JSON.stringify(d.args) },
    })),
    Match.tag("BlockTool", () => phase),
    Match.exhaustive,
  );

const applyAfterToolDecision = (phase: AfterTool, _decision: AfterToolDecision): AfterTool => phase;

const applyToolErrorDecision = (phase: ToolError, _decision: ToolErrorDecision): ToolError => phase;

export const makeSatelliteRing = <const Satellites extends ReadonlyArray<SatelliteAny>>(
  satellites: Satellites,
): Effect.Effect<
  SatelliteRingService<SatelliteRequirements<Satellites[number]>>,
  never,
  SatelliteRequirements<Satellites[number]>
> =>
  Effect.succeed({
    openScope: (startContext) =>
      Effect.gen(function* () {
        const cells = yield* Effect.forEach(satellites, (satellite) =>
          Effect.gen(function* () {
            const state = yield* satellite.open(startContext);
            const ref = yield* Ref.make<unknown>(state);
            return { name: satellite.name, ref, satellite };
          }),
        );

        const scope: SatelliteScope<SatelliteRequirements<Satellites[number]>> = {
          checkpoint: (checkpoint, ctx, onAction) =>
            runHook(
              cells,
              checkpoint,
              `checkpoint:${checkpoint}`,
              ctx,
              (satellite) => satellite.checkpoint,
              isCheckpointDecision,
              applyCheckpointDecision,
              onAction,
            ) as Effect.Effect<
              CheckpointDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          beforeCall: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "beforeCall",
              ctx,
              (satellite) => satellite.beforeCall,
              isBeforeCallDecision,
              applyBeforeCallDecision,
              onAction,
            ) as Effect.Effect<
              BeforeCallDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          afterCall: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "afterCall",
              ctx,
              (satellite) => satellite.afterCall,
              isAfterCallDecision,
              applyAfterCallDecision,
              onAction,
            ) as Effect.Effect<
              AfterCallDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          beforeTool: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "beforeTool",
              ctx,
              (satellite) => satellite.beforeTool,
              isBeforeToolDecision,
              applyBeforeToolDecision,
              onAction,
            ) as Effect.Effect<
              BeforeToolDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          afterTool: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "afterTool",
              ctx,
              (satellite) => satellite.afterTool,
              isAfterToolDecision,
              applyAfterToolDecision,
              onAction,
            ) as Effect.Effect<
              AfterToolDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          toolError: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "toolError",
              ctx,
              (satellite) => satellite.toolError,
              isToolErrorDecision,
              applyToolErrorDecision,
              onAction,
            ) as Effect.Effect<
              ToolErrorDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          close: closeCells(cells) as Effect.Effect<
            void,
            never,
            SatelliteRequirements<Satellites[number]>
          >,
        };

        return scope;
      }) as Effect.Effect<
        SatelliteScope<SatelliteRequirements<Satellites[number]>>,
        never,
        SatelliteRequirements<Satellites[number]>
      >,
  });

export const EmptySatelliteRing = Layer.effect(SatelliteRing)(makeSatelliteRing([]));

/** Default ring — explicit preset with built-in tool error recovery. */
export const DefaultSatelliteRing = Layer.effect(SatelliteRing)(makeSatelliteRing([toolRecovery]));

/** Build exactly the requested ring. Append built-ins explicitly at the call site if needed. */
export const SatelliteRingLive = <const Satellites extends ReadonlyArray<SatelliteAny>>(
  satellites: Satellites,
): Layer.Layer<SatelliteRing, never, SatelliteRequirements<Satellites[number]>> =>
  Layer.effect(SatelliteRing)(makeSatelliteRing(satellites));
