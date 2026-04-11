/**
 * Default tool error recovery satellite.
 *
 * Default tool error recovery — converts tool call errors into
 * LLM-friendly error strings so the model can retry or adjust.
 *
 * Included in DefaultSatelliteRing.
 */

import { Effect, Match } from "effect";
import type { Satellite } from "./types.ts";

export const toolRecovery: Satellite = {
  name: "tool-recovery",
  initial: undefined,
  handle: (phase) =>
    Match.value(phase).pipe(
      Match.tag("ToolError", ({ tool, error }) =>
        Effect.succeed({
          action: {
            _tag: "RecoverToolError" as const,
            result: Match.value(error).pipe(
              Match.tag("ToolCallUnknown", (e) => ({
                callId: tool.id,
                name: e.name,
                args: undefined as unknown,
                content: `Error: unknown tool "${e.name}"`,
              })),
              Match.tag("ToolCallBadArgs", (e) => ({
                callId: tool.id,
                name: e.name,
                args: e.raw as unknown,
                content: "Error: invalid JSON in tool arguments",
              })),
              Match.tag("ToolCallFailed", (e) => ({
                callId: tool.id,
                name: e.name,
                args: e.args,
                content: `Error: ${e.cause.message}`,
              })),
              Match.exhaustive,
            ),
          },
          state: undefined,
        }),
      ),
      Match.orElse(() => Effect.succeed({ action: { _tag: "Pass" as const }, state: undefined })),
    ),
};
