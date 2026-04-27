import { Context, Effect, Match } from "effect";
import { DispatchRegistry } from "../../registry.ts";
import {
  RuntimeNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
  type WorkControlCommand,
  type WorkNodeControlDescriptor,
  type WorkNodeSession,
} from "../types.ts";
import { capabilityForCommand, WorkControlDescriptors } from "../work-control.ts";

export interface WorkNodeController {
  readonly describe: (node: WorkNodeSession) => Effect.Effect<WorkNodeControlDescriptor>;
  readonly control: (
    node: WorkNodeSession,
    command: WorkControlCommand,
  ) => Effect.Effect<
    void,
    RuntimeNotFound | RuntimeWorkControlUnsupported | RuntimeWorkControlFailed
  >;
}

export class WorkNodeControllers extends Context.Service<
  WorkNodeControllers,
  {
    readonly describe: (node: WorkNodeSession) => Effect.Effect<WorkNodeControlDescriptor>;
    readonly control: (
      node: WorkNodeSession,
      command: WorkControlCommand,
    ) => Effect.Effect<
      void,
      RuntimeNotFound | RuntimeWorkControlUnsupported | RuntimeWorkControlFailed
    >;
  }
>()("WorkNodeControllers") {}

const unsupportedController = (node: WorkNodeSession): WorkNodeController => ({
  describe: () => Effect.succeed(WorkControlDescriptors.unsupported(node.kind)),
  control: (_node, command) =>
    Effect.fail(
      new RuntimeWorkControlUnsupported({
        workNodeId: node.workNodeId,
        command: command._tag,
        reason: `${node.kind} nodes do not support runtime control`,
      }),
    ),
});

const getDispatchId = (
  node: WorkNodeSession,
  command: WorkControlCommand,
): Effect.Effect<string, RuntimeWorkControlUnsupported> =>
  "dispatchId" in node && typeof node.dispatchId === "string"
    ? Effect.succeed(node.dispatchId)
    : Effect.fail(
        new RuntimeWorkControlUnsupported({
          workNodeId: node.workNodeId,
          command: command._tag,
          reason: "work node is not backed by a dispatch handle",
        }),
      );

const ensureSupported = (
  node: WorkNodeSession,
  command: WorkControlCommand,
): Effect.Effect<void, RuntimeWorkControlUnsupported> => {
  const capability = capabilityForCommand(WorkControlDescriptors.dispatch(node.state), command);
  return capability._tag === "Supported"
    ? Effect.void
    : Effect.fail(
        new RuntimeWorkControlUnsupported({
          workNodeId: node.workNodeId,
          command: command._tag,
          reason: capability.reason,
        }),
      );
};

const dispatchController = (
  registry: (typeof DispatchRegistry)["Service"],
): WorkNodeController => ({
  describe: (node) => Effect.succeed(WorkControlDescriptors.dispatch(node.state)),
  control: (node, command) =>
    Effect.gen(function* () {
      yield* ensureSupported(node, command);
      const dispatchId = yield* getDispatchId(node, command);
      const handle = yield* registry.get(dispatchId);
      if (handle === null) {
        return yield* new RuntimeNotFound({ kind: "dispatch", id: dispatchId });
      }
      return yield* Match.value(command).pipe(
        Match.tag("Interrupt", () =>
          handle.interrupt.pipe(
            Effect.mapError(
              (cause) =>
                new RuntimeWorkControlFailed({
                  workNodeId: node.workNodeId,
                  command: command._tag,
                  reason: "dispatch interrupt failed",
                  cause,
                }),
            ),
          ),
        ),
        Match.tag("InjectGuidance", ({ text }) =>
          handle
            .inject({
              _tag: "AppendMessages",
              messages: [{ role: "user", content: text }],
            })
            .pipe(
              Effect.mapError(
                (cause) =>
                  new RuntimeWorkControlFailed({
                    workNodeId: node.workNodeId,
                    command: command._tag,
                    reason: "dispatch guidance injection failed",
                    cause,
                  }),
              ),
            ),
        ),
        Match.tag("RequestStatus", () => Effect.void),
        Match.tag("Pause", () => Effect.void),
        Match.tag("Resume", () => Effect.void),
        Match.exhaustive,
      );
    }),
});

const controllerForNode = (
  registry: (typeof DispatchRegistry)["Service"],
  node: WorkNodeSession,
): WorkNodeController =>
  node.kind === "dispatch" ? dispatchController(registry) : unsupportedController(node);

export const WorkNodeControllersLive = Effect.gen(function* () {
  const registry = yield* DispatchRegistry;
  return WorkNodeControllers.of({
    describe: (node) => controllerForNode(registry, node).describe(node),
    control: (node, command) => controllerForNode(registry, node).control(node, command),
  });
});
