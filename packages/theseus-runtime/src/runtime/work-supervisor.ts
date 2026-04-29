import type * as Dispatch from "@theseus.run/core/Dispatch";
import { Cause, Context, Effect, Exit, Match, Ref, Scope } from "effect";
import { RuntimeEventBus } from "./event-bus.ts";
import { RuntimeEvents } from "./events.ts";
import {
  RuntimeNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
  type WorkControlCommand,
  type WorkNodeId,
  type WorkNodeSession,
  type WorkNodeState,
} from "./types.ts";

interface WorkEntry {
  readonly node: WorkNodeSession;
  readonly handle: Dispatch.DispatchHandle;
  readonly scope: Scope.Closeable;
  readonly children: ReadonlySet<WorkNodeId>;
  readonly state: WorkNodeState;
}

const causeReason = (cause: Cause.Cause<unknown>): string =>
  Cause.hasInterruptsOnly(cause) ? "Fiber interrupted" : String(Cause.squash(cause));

const isTerminal = (state: WorkNodeState): boolean =>
  Match.value(state).pipe(
    Match.when("done", () => true),
    Match.when("failed", () => true),
    Match.when("aborted", () => true),
    Match.orElse(() => false),
  );

const unsupported = (
  node: WorkNodeSession,
  command: WorkControlCommand,
  reason: string,
): RuntimeWorkControlUnsupported =>
  new RuntimeWorkControlUnsupported({
    workNodeId: node.workNodeId,
    command: command._tag,
    reason,
  });

const isActive = (state: WorkNodeState): boolean => state === "running" || state === "paused";

export class WorkSupervisor extends Context.Service<
  WorkSupervisor,
  {
    readonly registerDispatch: (
      node: WorkNodeSession,
      handle: Dispatch.DispatchHandle,
    ) => Effect.Effect<void>;
    readonly updateState: (
      workNodeId: WorkNodeId,
      state: WorkNodeState,
      reason?: string,
    ) => Effect.Effect<void>;
    readonly forkProcess: (
      workNodeId: WorkNodeId,
      process: string,
      effect: Effect.Effect<void>,
    ) => Effect.Effect<void, RuntimeNotFound>;
    readonly control: (
      workNodeId: WorkNodeId,
      command: WorkControlCommand,
    ) => Effect.Effect<
      void,
      RuntimeNotFound | RuntimeWorkControlUnsupported | RuntimeWorkControlFailed
    >;
  }
>()("WorkSupervisor") {}

export const WorkSupervisorLive = Effect.gen(function* () {
  const bus = yield* RuntimeEventBus;
  const entriesRef = yield* Ref.make<ReadonlyMap<WorkNodeId, WorkEntry>>(new Map());

  const publishState = (node: WorkNodeSession, state: WorkNodeState, reason?: string) =>
    bus.publish(RuntimeEvents.workNodeStateChanged(node, state, reason));

  const updateState = (workNodeId: WorkNodeId, state: WorkNodeState, reason?: string) =>
    Effect.gen(function* () {
      const entry = yield* Ref.modify(entriesRef, (entries) => {
        const current = entries.get(workNodeId);
        if (current === undefined) return [undefined, entries] as const;
        const next = new Map(entries);
        next.set(workNodeId, { ...current, state });
        return [current.node, next] as const;
      });
      if (entry !== undefined) {
        yield* publishState(entry, state, reason);
      }
    });

  const getEntry = (workNodeId: WorkNodeId): Effect.Effect<WorkEntry, RuntimeNotFound> =>
    Ref.get(entriesRef).pipe(
      Effect.flatMap((entries) => {
        const entry = entries.get(workNodeId);
        return entry === undefined
          ? Effect.fail(new RuntimeNotFound({ kind: "workNode", id: workNodeId }))
          : Effect.succeed(entry);
      }),
    );

  const controlNode = (
    workNodeId: WorkNodeId,
    command: WorkControlCommand,
  ): Effect.Effect<
    void,
    RuntimeNotFound | RuntimeWorkControlUnsupported | RuntimeWorkControlFailed
  > =>
    Effect.gen(function* () {
      const entry = yield* getEntry(workNodeId);
      const childIds = [...entry.children];
      const controlChild = (childId: WorkNodeId) =>
        controlNode(childId, command).pipe(
          Effect.catchTag("RuntimeWorkControlUnsupported", () => Effect.void),
        );

      return yield* Match.value(command).pipe(
        Match.tag("Stop", ({ reason }) =>
          Effect.gen(function* () {
            yield* Effect.forEach(childIds, controlChild, { discard: true });
            if (!isActive(entry.state)) {
              return yield* unsupported(
                entry.node,
                command,
                isTerminal(entry.state)
                  ? "work node is already terminal"
                  : "work node is not active",
              );
            }
            yield* entry.handle.stop(reason ?? "Stopped by runtime work control").pipe(
              Effect.mapError(
                (cause) =>
                  new RuntimeWorkControlFailed({
                    workNodeId,
                    command: command._tag,
                    reason: "dispatch stop failed",
                    cause,
                  }),
              ),
            );
            yield* updateState(workNodeId, "aborted", reason);
            yield* Scope.close(entry.scope, Exit.void);
          }),
        ),
        Match.tag("Pause", () =>
          Effect.gen(function* () {
            if (!isActive(entry.state)) {
              return yield* unsupported(entry.node, command, "work node is not active");
            }
            yield* Effect.forEach(childIds, controlChild, { discard: true });
            yield* entry.handle.pause;
            yield* updateState(workNodeId, "paused");
          }),
        ),
        Match.tag("Resume", () =>
          Effect.gen(function* () {
            if (entry.state !== "paused") {
              return yield* unsupported(entry.node, command, "work node is not paused");
            }
            yield* entry.handle.resume;
            yield* updateState(workNodeId, "running");
            yield* Effect.forEach(childIds, controlChild, { discard: true });
          }),
        ),
        Match.tag("InjectGuidance", ({ text }) =>
          entry.state === "running"
            ? entry.handle
                .inject({
                  _tag: "AppendMessages",
                  messages: [{ role: "user", content: text }],
                })
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new RuntimeWorkControlFailed({
                        workNodeId,
                        command: command._tag,
                        reason: "dispatch guidance injection failed",
                        cause,
                      }),
                  ),
                )
            : Effect.fail(unsupported(entry.node, command, "work node is not running")),
        ),
        Match.tag("Interrupt", ({ reason }) =>
          controlNode(workNodeId, { _tag: "Stop", ...(reason !== undefined ? { reason } : {}) }),
        ),
        Match.tag("RequestStatus", () => Effect.void),
        Match.exhaustive,
      );
    });

  const forkProcess = (workNodeId: WorkNodeId, process: string, effect: Effect.Effect<void>) =>
    Effect.gen(function* () {
      const entry = yield* getEntry(workNodeId);
      yield* Effect.forkIn(
        effect.pipe(
          Effect.catchCause((cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              return Effect.void;
            }
            const reason = causeReason(cause);
            return Effect.gen(function* () {
              yield* Effect.logWarning("runtime process failed").pipe(
                Effect.annotateLogs({
                  process,
                  reason,
                  "mission.id": entry.node.missionId,
                  "work_node.id": entry.node.workNodeId,
                }),
              );
              yield* bus.publish(RuntimeEvents.runtimeProcessFailed(entry.node, process, reason));
              const current = yield* Ref.get(entriesRef).pipe(
                Effect.map((entries) => entries.get(workNodeId)),
              );
              if (current !== undefined && !isTerminal(current.state)) {
                yield* updateState(workNodeId, "failed", `${process}: ${reason}`);
              }
            });
          }),
          Effect.withSpan("runtime.work.process", {
            attributes: {
              "runtime.process": process,
              "mission.id": entry.node.missionId,
              "capsule.id": entry.node.capsuleId,
              "work_node.id": entry.node.workNodeId,
            },
          }),
        ),
        entry.scope,
        { startImmediately: true },
      );
    });

  return WorkSupervisor.of({
    registerDispatch: (node, handle) =>
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        yield* Ref.update(entriesRef, (entries) => {
          const next = new Map(entries);
          next.set(node.workNodeId, {
            node,
            handle,
            scope,
            children: new Set(),
            state: node.state,
          });
          if (node.parentWorkNodeId !== undefined) {
            const parent = next.get(node.parentWorkNodeId);
            if (parent !== undefined) {
              next.set(node.parentWorkNodeId, {
                ...parent,
                children: new Set([...parent.children, node.workNodeId]),
              });
            }
          }
          return next;
        });
      }),
    updateState,
    forkProcess,
    control: controlNode,
  });
});
