/**
 * Capsule-backed tools for agents.
 *
 * These tools belong to the Capsule boundary rather than AgentComm: they expose
 * append/read access to the mission log and can be attached to any agent.
 */

import { Effect, Schema } from "effect";
import { defineTool, type Tool } from "../tool/index.ts";
import { Capsule } from "./index.ts";

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

/**
 * Create a theseus_log tool that logs events to the Capsule.
 *
 * @param agentName - the "by" field in Capsule events
 */
export const makeLogTool = (
  agentName: string,
): Effect.Effect<Tool<LogInputType, string, never, never>, never, Capsule> =>
  Effect.gen(function* () {
    const capsule = yield* Capsule;

    return defineTool<LogInputType>({
      name: "theseus_log",
      description:
        "Log an event to the mission capsule. Use for decisions, concerns, friction, or notes.",
      input: LogInput as unknown as Schema.Schema<LogInputType>,
      policy: { interaction: "write" },
      execute: ({ type, summary }) =>
        capsule
          .log({ type, by: agentName, data: { summary } })
          .pipe(Effect.map(() => `Logged: ${type} - ${summary}`)),
    });
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

/**
 * Create a theseus_read_capsule tool that reads the Capsule event trail.
 */
export const makeReadCapsuleTool = (): Effect.Effect<
  Tool<ReadCapsuleInputType, string, never, never>,
  never,
  Capsule
> =>
  Effect.gen(function* () {
    const capsule = yield* Capsule;

    return defineTool<ReadCapsuleInputType>({
      name: "theseus_read_capsule",
      description:
        "Read recent events from the mission capsule. Returns the event trail for context.",
      input: ReadCapsuleInput as unknown as Schema.Schema<ReadCapsuleInputType>,
      policy: { interaction: "observe" },
      execute: ({ tail }) =>
        capsule.read().pipe(
          Effect.map((events) => {
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
        ),
    });
  });
