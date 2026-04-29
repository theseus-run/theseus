import { Context, Effect } from "effect";
import type {
  RuntimeNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
  WorkControlCommand,
  WorkNodeControlDescriptor,
  WorkNodeSession,
} from "../types.ts";
import { WorkControlDescriptors } from "../work-control.ts";
import { WorkSupervisor } from "../work-supervisor.ts";

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

export const WorkNodeControllersLive = Effect.gen(function* () {
  const supervisor = yield* WorkSupervisor;
  return WorkNodeControllers.of({
    describe: (node) =>
      Effect.succeed(
        node.kind === "dispatch"
          ? WorkControlDescriptors.dispatch(node.state)
          : WorkControlDescriptors.unsupported(node.kind),
      ),
    control: (node, command) => supervisor.control(node.workNodeId, command),
  });
});
