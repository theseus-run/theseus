/**
 * Capsule-backed tools for agents.
 *
 * These tools belong to the Capsule boundary rather than AgentComm: they expose
 * append/read access to the mission log and can be attached to any agent.
 */

import { Effect, Schema } from "effect";
import { AgentIdentity } from "../agent/index.ts";
import { Defaults, defineTool, type Tool } from "../tool/index.ts";
import { CurrentCapsule } from "./index.ts";

// ---------------------------------------------------------------------------
// theseus.log — append an event to the Capsule
// ---------------------------------------------------------------------------

const LogInput = Schema.Struct({
  type: Schema.Literals([
    "mission.note",
    "mission.decide",
    "mission.concern",
    "mission.friction",
    "mission.learning",
    "mission.error",
    "mission.scope",
  ]).annotate({ description: "Event type to log." }),
  summary: Schema.String.annotate({
    description: "Brief description of what happened",
  }),
});

type LogInputType = Schema.Schema.Type<typeof LogInput>;

export const logCapsuleTool: Tool<LogInputType, string, never, CurrentCapsule | AgentIdentity> =
  defineTool({
    name: "theseus_log",
    description:
      "Log an event to the mission capsule. Use for decisions, concerns, friction, or notes.",
    input: LogInput,
    output: Defaults.TextOutput,
    failure: Defaults.NoFailure,
    policy: { interaction: "write" },
    execute: ({ type, summary }) =>
      Effect.gen(function* () {
        const capsule = yield* CurrentCapsule;
        const identity = yield* AgentIdentity;
        yield* capsule.log({ type, by: identity.name, data: { summary } });
        return `Logged: ${type} - ${summary}`;
      }),
  });

// ---------------------------------------------------------------------------
// theseus.read_capsule — read the Capsule event trail
// ---------------------------------------------------------------------------

const ReadCapsuleInput = Schema.Struct({
  tail: Schema.optional(
    Schema.Int.annotate({
      description: "Number of most recent events to return (1-50, default: 10)",
    }),
  ),
});

type ReadCapsuleInputType = Schema.Schema.Type<typeof ReadCapsuleInput>;

const clampTail = (tail: number | undefined): number => {
  if (tail === undefined) return 10;
  return Math.min(50, Math.max(1, tail));
};

export const readCapsuleTool: Tool<ReadCapsuleInputType, string, never, CurrentCapsule> = defineTool({
  name: "theseus_read_capsule",
  description: "Read recent events from the mission capsule. Returns the event trail for context.",
  input: ReadCapsuleInput,
  output: Defaults.TextOutput,
  failure: Defaults.NoFailure,
  policy: { interaction: "observe" },
  execute: ({ tail }) =>
    Effect.gen(function* () {
      const capsule = yield* CurrentCapsule;
      const events = yield* capsule.read();
      const recent = events.slice(-clampTail(tail));
      return (
        recent
          .map(
            (e) =>
              `[${e.at.slice(11, 19)}] ${e.type} by ${e.by}: ${JSON.stringify(e.data).slice(0, 100)}`,
          )
          .join("\n") || "(no events)"
      );
    }),
});
