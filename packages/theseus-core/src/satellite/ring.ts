/**
 * SatelliteRing — ordered dispatch middleware composition.
 *
 * The ring is static configuration. `openScope` creates one live
 * SatelliteScope per dispatch; all satellite state is scoped to that dispatch.
 */

import { Context, Effect, Layer, Ref } from "effect";
import {
  applyAfterCallDecision,
  applyAfterToolDecision,
  applyBeforeCallDecision,
  applyBeforeToolDecision,
  applyCheckpointDecision,
  applyToolErrorDecision,
  isAfterCallDecision,
  isAfterToolDecision,
  isBeforeCallDecision,
  isBeforeToolDecision,
  isCheckpointDecision,
  isTerminalDecision,
  isToolErrorDecision,
} from "./decisions.ts";
import { toolRecovery } from "./tool-recovery.ts";
import type {
  AfterCallDecision,
  AfterToolDecision,
  BeforeCallDecision,
  BeforeToolDecision,
  CheckpointDecision,
  SatelliteAbort,
  SatelliteAny,
  SatelliteCheckpoint,
  SatelliteContext,
  SatelliteDecision,
  SatelliteRequirements,
  SatelliteScope,
  SatelliteStartContext,
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

const phaseName = (phase: string) => phase;

type StateCell = {
  readonly name: string;
  readonly ref: Ref.Ref<unknown>;
  readonly satellite: SatelliteAny;
};

type HookSelector<Phase, Decision extends SatelliteDecision> = (
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
  | undefined;

type DecisionGuard<Decision extends SatelliteDecision> = (
  decision: SatelliteDecision,
) => decision is Decision;

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

const runUntypedPhaseHook = <Phase, Decision extends SatelliteDecision>(
  cells: ReadonlyArray<StateCell>,
  phase: Phase,
  phaseLabel: string,
  ctx: SatelliteContext,
  getHook: HookSelector<Phase, Decision>,
  isDecision: DecisionGuard<Decision>,
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
        return yield* new SatelliteAbortError({
          satellite: cell.name,
          reason: `Invalid ${phaseLabel} decision: ${decision._tag}`,
        });
      }

      if (decision._tag === "Pass") continue;
      if (onAction) yield* onAction(cell.name, phaseName(phaseLabel), decision._tag);

      lastDecision = decision;
      if (isTerminalDecision(decision)) break;
      currentPhase = applyDecision(currentPhase, decision);
    }

    return lastDecision;
  });

const runPhaseHook = <Phase, Decision extends SatelliteDecision, R>(
  cells: ReadonlyArray<StateCell>,
  phase: Phase,
  phaseLabel: string,
  ctx: SatelliteContext,
  getHook: HookSelector<Phase, Decision>,
  isDecision: DecisionGuard<Decision>,
  applyDecision: (phase: Phase, decision: Decision) => Phase,
  onAction?: SatelliteActionCallback,
): Effect.Effect<Decision, SatelliteAbort, R> =>
  // The static ring stores heterogeneous satellites, so TypeScript cannot
  // retain each hook's service environment through the array. The public
  // SatelliteScope type carries the unioned R; this is the one adapter that
  // narrows the internal unknown environment back to that public contract.
  runUntypedPhaseHook(
    cells,
    phase,
    phaseLabel,
    ctx,
    getHook,
    isDecision,
    applyDecision,
    onAction,
  ) as Effect.Effect<Decision, SatelliteAbort, R>;

const runCheckpointHook = <R>(
  cells: ReadonlyArray<StateCell>,
  checkpoint: Parameters<SatelliteScope<R>["checkpoint"]>[0],
  ctx: SatelliteContext,
  onAction?: SatelliteActionCallback,
): Effect.Effect<CheckpointDecision, SatelliteAbort, R> =>
  runPhaseHook<SatelliteCheckpoint, CheckpointDecision, R>(
    cells,
    checkpoint,
    `checkpoint:${checkpoint}`,
    ctx,
    (satellite) => satellite.checkpoint,
    isCheckpointDecision,
    applyCheckpointDecision,
    onAction,
  );

const runBeforeCallHook = <R>(
  cells: ReadonlyArray<StateCell>,
  phase: Parameters<SatelliteScope<R>["beforeCall"]>[0],
  ctx: SatelliteContext,
  onAction?: SatelliteActionCallback,
): Effect.Effect<BeforeCallDecision, SatelliteAbort, R> =>
  runPhaseHook(
    cells,
    phase,
    "beforeCall",
    ctx,
    (satellite) => satellite.beforeCall,
    isBeforeCallDecision,
    applyBeforeCallDecision,
    onAction,
  );

const runAfterCallHook = <R>(
  cells: ReadonlyArray<StateCell>,
  phase: Parameters<SatelliteScope<R>["afterCall"]>[0],
  ctx: SatelliteContext,
  onAction?: SatelliteActionCallback,
): Effect.Effect<AfterCallDecision, SatelliteAbort, R> =>
  runPhaseHook(
    cells,
    phase,
    "afterCall",
    ctx,
    (satellite) => satellite.afterCall,
    isAfterCallDecision,
    applyAfterCallDecision,
    onAction,
  );

const runBeforeToolHook = <R>(
  cells: ReadonlyArray<StateCell>,
  phase: Parameters<SatelliteScope<R>["beforeTool"]>[0],
  ctx: SatelliteContext,
  onAction?: SatelliteActionCallback,
): Effect.Effect<BeforeToolDecision, SatelliteAbort, R> =>
  runPhaseHook(
    cells,
    phase,
    "beforeTool",
    ctx,
    (satellite) => satellite.beforeTool,
    isBeforeToolDecision,
    applyBeforeToolDecision,
    onAction,
  );

const runAfterToolHook = <R>(
  cells: ReadonlyArray<StateCell>,
  phase: Parameters<SatelliteScope<R>["afterTool"]>[0],
  ctx: SatelliteContext,
  onAction?: SatelliteActionCallback,
): Effect.Effect<AfterToolDecision, SatelliteAbort, R> =>
  runPhaseHook(
    cells,
    phase,
    "afterTool",
    ctx,
    (satellite) => satellite.afterTool,
    isAfterToolDecision,
    applyAfterToolDecision,
    onAction,
  );

const runToolErrorHook = <R>(
  cells: ReadonlyArray<StateCell>,
  phase: Parameters<SatelliteScope<R>["toolError"]>[0],
  ctx: SatelliteContext,
  onAction?: SatelliteActionCallback,
): Effect.Effect<ToolErrorDecision, SatelliteAbort, R> =>
  runPhaseHook(
    cells,
    phase,
    "toolError",
    ctx,
    (satellite) => satellite.toolError,
    isToolErrorDecision,
    applyToolErrorDecision,
    onAction,
  );

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
            runCheckpointHook<SatelliteRequirements<Satellites[number]>>(
              cells,
              checkpoint,
              ctx,
              onAction,
            ),

          beforeCall: (phase, ctx, onAction) =>
            runBeforeCallHook<SatelliteRequirements<Satellites[number]>>(
              cells,
              phase,
              ctx,
              onAction,
            ),

          afterCall: (phase, ctx, onAction) =>
            runAfterCallHook<SatelliteRequirements<Satellites[number]>>(
              cells,
              phase,
              ctx,
              onAction,
            ),

          beforeTool: (phase, ctx, onAction) =>
            runBeforeToolHook<SatelliteRequirements<Satellites[number]>>(
              cells,
              phase,
              ctx,
              onAction,
            ),

          afterTool: (phase, ctx, onAction) =>
            runAfterToolHook<SatelliteRequirements<Satellites[number]>>(
              cells,
              phase,
              ctx,
              onAction,
            ),

          toolError: (phase, ctx, onAction) =>
            runToolErrorHook<SatelliteRequirements<Satellites[number]>>(
              cells,
              phase,
              ctx,
              onAction,
            ),

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
