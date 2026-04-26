import { Effect, Match, Option, Queue } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { redirectMessages } from "./messages.ts";
import type { Injection } from "./types.ts";

export type InjectionDrain =
  | {
      readonly _tag: "Continue";
      readonly messages: ReadonlyArray<Prompt.MessageEncoded>;
    }
  | {
      readonly _tag: "Interrupted";
      readonly reason?: string;
    };

export const injectionDetail = (injection: Injection): string | undefined =>
  Match.value(injection).pipe(
    Match.tag("Redirect", ({ task }) => task),
    Match.tag("Interrupt", ({ reason }) => reason),
    Match.tag("AppendMessages", () => undefined),
    Match.tag("ReplaceMessages", () => undefined),
    Match.tag("CollapseContext", () => undefined),
    Match.exhaustive,
  );

export const drainInjections = (
  injectionQueue: Queue.Queue<Injection>,
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  onInjection: (injection: Injection) => Effect.Effect<void>,
): Effect.Effect<InjectionDrain> =>
  Effect.gen(function* () {
    let current = messages;
    let opt = yield* Queue.poll(injectionQueue);
    while (Option.isSome(opt)) {
      yield* onInjection(opt.value);
      const previous = current;
      const next = Match.value(opt.value).pipe(
        Match.tag("Interrupt", () => undefined),
        Match.tag("AppendMessages", (injection) => [...previous, ...injection.messages]),
        Match.tag("ReplaceMessages", (injection) => injection.messages),
        Match.tag("Redirect", (injection) => redirectMessages(previous, injection.task)),
        Match.tag("CollapseContext", () => previous),
        Match.exhaustive,
      );
      if (next === undefined) {
        const reason = injectionDetail(opt.value);
        return reason === undefined ? { _tag: "Interrupted" } : { _tag: "Interrupted", reason };
      }
      current = next;
      opt = yield* Queue.poll(injectionQueue);
    }
    return { _tag: "Continue", messages: current };
  });
