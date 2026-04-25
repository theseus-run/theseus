/**
 * MissionStore — collection boundary for mission records.
 *
 * Minimal today: create a mission record and own mission id generation.
 * Current mission access remains the `MissionContext` service.
 */

import { Context, Effect, Layer } from "effect";
import type { Capsule } from "../capsule/index.ts";
import type { MissionRecord } from "./context.ts";
import { makeMissionId } from "./id.ts";
import { type MissionConfig, makeMissionRecord } from "./layer.ts";

export interface MissionCreate {
  readonly slug?: string;
  readonly goal: string;
  readonly criteria: ReadonlyArray<string>;
}

export class MissionStore extends Context.Service<
  MissionStore,
  {
    readonly create: (input: MissionCreate) => Effect.Effect<MissionRecord, never, Capsule>;
  }
>()("MissionStore") {}

export const InMemoryMissionStore: Layer.Layer<MissionStore> = Layer.succeed(MissionStore)({
  create: (input) =>
    Effect.gen(function* () {
      const id = yield* makeMissionId(input.slug);
      const config: MissionConfig = {
        id,
        goal: input.goal,
        criteria: input.criteria,
      };
      return yield* makeMissionRecord(config);
    }),
});
