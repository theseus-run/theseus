/**
 * theseus.log + theseus.read_capsule — Capsule access tools for agents.
 *
 * Any agent can log events or read the Capsule trail.
 * Require Capsule in scope (always available with capsule-first arch).
 *
 * These are tool factories — they close over the Capsule service.
 */

import { Effect, Schema } from "effect";
import { defineTool, meta, type Tool } from "../tool/index.ts";
import { Capsule } from "../capsule/index.ts";

// ---------------------------------------------------------------------------
// theseus.log — append an event to the Capsule
// ---------------------------------------------------------------------------

const LogInput = Schema.Struct({
  type: Schema.Literals([
    "mission.note",       // free-form observation
    "mission.decide",     // decision made (rationale, trade-offs)
    "mission.concern",    // concern identified (not blocking)
    "mission.friction",   // protocol violation, ambiguity, impediment
    "mission.learning",   // cross-mission insight for future improvement
    "mission.error",      // error occurred (actionable, not a crash)
    "mission.scope",      // scope expanded beyond original criteria
  ]).annotate({ description: "Event type to log." }),
  summary: Schema.String.annotate({
    description: "Brief description of what happened",
  }),
});

type LogInputType = Schema.Schema.Type<typeof LogInput>;

/**
 * Create a theseus.log tool that logs events to the Capsule.
 * Closes over the Capsule service.
 *
 * @param agentName — the "by" field in Capsule events
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
      meta: meta({ mutation: "write", capabilities: ["capsule.write"] }),
      execute: ({ type, summary }) =>
        capsule.log({ type, by: agentName, data: { summary } }).pipe(
          Effect.map(() => `Logged: ${type} — ${summary}`),
        ),
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

/**
 * Create a theseus.read_capsule tool that reads the Capsule event trail.
 * Closes over the Capsule service.
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
      meta: meta({ mutation: "readonly", capabilities: ["capsule.read"] }),
      execute: ({ tail }) =>
        capsule.read().pipe(
          Effect.map((events) => {
            const recent = tail ? events.slice(-tail) : events.slice(-10);
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
