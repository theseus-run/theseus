import { Deferred, Effect, Match, Ref } from "effect";
import type { DispatchIdentity } from "./lifecycle.ts";
import { interrupted } from "./lifecycle.ts";
import type { DispatchError } from "./types.ts";

export type DispatchControlState =
  | { readonly _tag: "Running" }
  | { readonly _tag: "Paused"; readonly resume: Deferred.Deferred<void, DispatchError> }
  | { readonly _tag: "Stopped"; readonly reason: string };

export interface DispatchControlGate {
  readonly awaitOpen: Effect.Effect<void, DispatchError>;
  readonly pause: Effect.Effect<void>;
  readonly resume: Effect.Effect<void>;
  readonly stop: (reason?: string) => Effect.Effect<void>;
  readonly state: Effect.Effect<DispatchControlState>;
}

const stopReason = (reason: string | undefined): string => reason ?? "Stopped by control gate";

export const makeDispatchControlGate = (
  identity: DispatchIdentity,
): Effect.Effect<DispatchControlGate> =>
  Effect.gen(function* () {
    const stateRef = yield* Ref.make<DispatchControlState>({ _tag: "Running" });

    const awaitOpen: Effect.Effect<void, DispatchError> = Effect.flatMap(
      Ref.get(stateRef),
      (state) =>
        Match.value(state).pipe(
          Match.tag("Running", () => Effect.void),
          Match.tag("Paused", ({ resume }) =>
            Deferred.await(resume).pipe(Effect.flatMap(() => awaitOpen)),
          ),
          Match.tag("Stopped", ({ reason }) => Effect.fail(interrupted(identity, reason))),
          Match.exhaustive,
        ),
    );

    return {
      awaitOpen,
      pause: Effect.gen(function* () {
        const resume = yield* Deferred.make<void, DispatchError>();
        yield* Ref.update(stateRef, (state) =>
          Match.value(state).pipe(
            Match.tag("Running", (): DispatchControlState => ({ _tag: "Paused", resume })),
            Match.tag("Paused", () => state),
            Match.tag("Stopped", () => state),
            Match.exhaustive,
          ),
        );
      }),
      resume: Effect.gen(function* () {
        const resume = yield* Ref.modify(stateRef, (state) =>
          Match.value(state).pipe(
            Match.tag("Running", () => [undefined, state] as const),
            Match.tag(
              "Paused",
              ({ resume }) => [resume, { _tag: "Running" } satisfies DispatchControlState] as const,
            ),
            Match.tag("Stopped", () => [undefined, state] as const),
            Match.exhaustive,
          ),
        );
        if (resume !== undefined) {
          yield* Deferred.succeed(resume, undefined);
        }
      }),
      stop: (reason) =>
        Effect.gen(function* () {
          const finalReason = stopReason(reason);
          const resume = yield* Ref.modify(stateRef, (state) =>
            Match.value(state).pipe(
              Match.tag(
                "Running",
                () =>
                  [
                    undefined,
                    { _tag: "Stopped", reason: finalReason } satisfies DispatchControlState,
                  ] as const,
              ),
              Match.tag(
                "Paused",
                ({ resume }) =>
                  [
                    resume,
                    { _tag: "Stopped", reason: finalReason } satisfies DispatchControlState,
                  ] as const,
              ),
              Match.tag("Stopped", () => [undefined, state] as const),
              Match.exhaustive,
            ),
          );
          if (resume !== undefined) {
            yield* Deferred.fail(resume, interrupted(identity, finalReason));
          }
        }),
      state: Ref.get(stateRef),
    };
  });

export const NoopDispatchControlGate: DispatchControlGate = {
  awaitOpen: Effect.void,
  pause: Effect.void,
  resume: Effect.void,
  stop: () => Effect.void,
  state: Effect.succeed({ _tag: "Running" }),
};
