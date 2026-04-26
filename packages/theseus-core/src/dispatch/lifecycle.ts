import { Cause, Effect, Exit, Match } from "effect";
import type { SatelliteAbort } from "../satellite/types.ts";
import * as DispatchEvents from "./events.ts";
import {
  type DispatchError,
  DispatchInterrupted,
  type DispatchOutput,
  type Usage,
} from "./types.ts";

type Emit = (event: ReturnType<typeof DispatchEvents.failed>) => Effect.Effect<void>;

export interface DispatchIdentity {
  readonly dispatchId: string;
  readonly name: string;
}

export const interrupted = (identity: DispatchIdentity, reason?: string): DispatchInterrupted =>
  new DispatchInterrupted({
    dispatchId: identity.dispatchId,
    name: identity.name,
    ...(reason !== undefined ? { reason } : {}),
  });

export const interruptedFromSatellite = (
  identity: DispatchIdentity,
  abort: SatelliteAbort,
): DispatchInterrupted => interrupted(identity, `Satellite "${abort.satellite}": ${abort.reason}`);

export const interruptedFromCause = (
  identity: DispatchIdentity,
  cause: Cause.Cause<unknown>,
): DispatchInterrupted | undefined =>
  Cause.hasInterruptsOnly(cause) ? interrupted(identity, "Fiber interrupted") : undefined;

export const failureReason = (cause: Cause.Cause<unknown>): string =>
  Cause.hasInterruptsOnly(cause) ? "Fiber interrupted" : String(Cause.squash(cause));

export const normalizeLoopError = (
  identity: DispatchIdentity,
  error: DispatchError | SatelliteAbort,
): DispatchError =>
  Match.value(error).pipe(
    Match.tag("DispatchInterrupted", (error) => error),
    Match.tag("DispatchCycleExceeded", (error) => error),
    Match.tag("DispatchModelFailed", (error) => error),
    Match.tag("DispatchToolFailed", (error) => error),
    Match.tag("SatelliteAbort", (abort) => interruptedFromSatellite(identity, abort)),
    Match.exhaustive,
  );

export const zeroUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0 });

export const settleDispatchResult = (input: {
  readonly identity: DispatchIdentity;
  readonly exit: Exit.Exit<DispatchOutput, DispatchError>;
  readonly emitFailed: Emit;
  readonly succeed: (result: DispatchOutput) => Effect.Effect<void>;
  readonly fail: (error: DispatchError) => Effect.Effect<void>;
  readonly failCause: (cause: Cause.Cause<DispatchError>) => Effect.Effect<void>;
}): Effect.Effect<void> =>
  Exit.match(input.exit, {
    onSuccess: input.succeed,
    onFailure: (cause) => {
      const failure = interruptedFromCause(input.identity, cause);
      return input
        .emitFailed(DispatchEvents.failed(input.identity.name, failureReason(cause)))
        .pipe(Effect.flatMap(() => (failure ? input.fail(failure) : input.failCause(cause))));
    },
  });
