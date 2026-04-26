import { Effect, Match, Option, Queue } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import { redirectMessages } from "./messages.ts";
import type { Injection } from "./types.ts";

export const drainInjections = (
  injectionQueue: Queue.Queue<Injection>,
  messages: ReadonlyArray<Prompt.MessageEncoded>,
  onInjection: (injection: Injection) => Effect.Effect<void>,
): Effect.Effect<ReadonlyArray<Prompt.MessageEncoded> | undefined> =>
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
      if (next === undefined) return undefined;
      current = next;
      opt = yield* Queue.poll(injectionQueue);
    }
    return current;
  });
