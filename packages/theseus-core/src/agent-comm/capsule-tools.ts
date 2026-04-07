/**
 * theseus.log + theseus.read_capsule — Capsule access tools for agents.
 *
 * Any agent can log events or read the Capsule trail.
 * Require Capsule in scope (always available with capsule-first arch).
 *
 * These are tool factories — they close over the Capsule service.
 */

import { Effect } from "effect";
import { defineTool, type ToolAny } from "../tool/index.ts";
import { fromZod } from "../tool/zod.ts";
import { Capsule } from "../capsule/index.ts";
import { z } from "zod";

// ---------------------------------------------------------------------------
// theseus.log — append an event to the Capsule
// ---------------------------------------------------------------------------

const logSchema = z.object({
  type: z.enum([
    "mission.note",       // free-form observation
    "mission.decide",     // decision made (rationale, trade-offs)
    "mission.concern",    // concern identified (not blocking)
    "mission.friction",   // protocol violation, ambiguity, impediment
    "mission.learning",   // cross-mission insight for future improvement
    "mission.error",      // error occurred (actionable, not a crash)
    "mission.scope",      // scope expanded beyond original criteria
  ]).describe("Event type to log."),
  summary: z.string().min(1).describe("Brief description of what happened"),
});

/**
 * Create a theseus.log tool that logs events to the Capsule.
 * Closes over the Capsule service.
 *
 * @param agentName — the "by" field in Capsule events
 */
export const makeLogTool = (agentName: string): Effect.Effect<ToolAny, never, Capsule> =>
  Effect.gen(function* () {
    const capsule = yield* Capsule;

    return defineTool<{ type: string; summary: string }, string>({
      name: "theseus_log",
      description: "Log an event to the mission capsule. Use for decisions, concerns, friction, or notes.",
      inputSchema: fromZod(logSchema),
      safety: "readonly",
      capabilities: ["capsule"],
      execute: ({ type, summary }) =>
        capsule.log({ type, by: agentName, data: { summary } }).pipe(
          Effect.map(() => `Logged: ${type} — ${summary}`),
        ),
      encode: (s) => s,
    });
  });

// ---------------------------------------------------------------------------
// theseus.read_capsule — read the Capsule event trail
// ---------------------------------------------------------------------------

const readCapsuleSchema = z.object({
  tail: z.number().int().min(1).max(50).optional().describe("Number of most recent events to return (default: 10)"),
});

/**
 * Create a theseus.read_capsule tool that reads the Capsule event trail.
 * Closes over the Capsule service.
 */
export const makeReadCapsuleTool = (): Effect.Effect<ToolAny, never, Capsule> =>
  Effect.gen(function* () {
    const capsule = yield* Capsule;

    return defineTool<{ tail?: number | undefined }, string>({
      name: "theseus_read_capsule",
      description: "Read recent events from the mission capsule. Returns the event trail for context.",
      inputSchema: fromZod(readCapsuleSchema),
      safety: "readonly",
      capabilities: ["capsule"],
      execute: ({ tail }) =>
        capsule.read().pipe(
          Effect.map((events) => {
            const recent = tail ? events.slice(-tail) : events.slice(-10);
            return recent
              .map((e) => `[${e.at.slice(11, 19)}] ${e.type} by ${e.by}: ${JSON.stringify(e.data).slice(0, 100)}`)
              .join("\n") || "(no events)";
          }),
        ),
      encode: (s) => s,
    });
  });
