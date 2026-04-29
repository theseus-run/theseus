import { Context, Effect, Layer, Match, PubSub, Stream } from "effect";
import type { RuntimeDispatchEvent } from "./types.ts";

const missionIdOf = (event: RuntimeDispatchEvent): string =>
  Match.value(event).pipe(
    Match.tag("WorkNodeStarted", ({ node }) => node.missionId),
    Match.tag("DispatchSessionStarted", ({ session }) => session.missionId),
    Match.tag("DispatchEvent", ({ missionId }) => missionId),
    Match.tag("WorkNodeStateChanged", ({ missionId }) => missionId),
    Match.tag("RuntimeProcessFailed", ({ missionId }) => missionId),
    Match.exhaustive,
  );

export class RuntimeEventBus extends Context.Service<
  RuntimeEventBus,
  {
    readonly publish: (event: RuntimeDispatchEvent) => Effect.Effect<void>;
    readonly streamMission: (missionId: string) => Stream.Stream<RuntimeDispatchEvent>;
  }
>()("RuntimeEventBus") {}

export const RuntimeEventBusLive: Layer.Layer<RuntimeEventBus> = Layer.effect(RuntimeEventBus)(
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<RuntimeDispatchEvent>({ replay: 1024 });
    return RuntimeEventBus.of({
      publish: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
      streamMission: (missionId) =>
        Stream.fromPubSub(pubsub).pipe(Stream.filter((event) => missionIdOf(event) === missionId)),
    });
  }),
);
