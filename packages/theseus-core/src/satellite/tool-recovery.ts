/**
 * Default tool error recovery — converts tool call errors into
 * LLM-friendly error Presentations so the model can retry or adjust.
 *
 * Included in DefaultSatelliteRing.
 */

import { Effect, Match } from "effect";
import { textPresentation } from "../tool/index.ts";
import type { ToolCallResult } from "../dispatch/types.ts";
import type { Satellite } from "./types.ts";
import { Pass, RecoverToolError } from "./types.ts";

const errorResult = (
  callId: string,
  name: string,
  args: unknown,
  message: string,
): ToolCallResult => {
  const presentation = textPresentation(message, { isError: true });
  return {
    callId,
    name,
    args,
    presentation,
    textContent: message,
  };
};

export const toolRecovery: Satellite = {
  name: "tool-recovery",
  initial: undefined,
  handle: (phase) =>
    Match.value(phase).pipe(
      Match.tag("ToolError", ({ tool, error }) =>
        Effect.succeed({
          action: RecoverToolError(
            Match.value(error).pipe(
              Match.tag("ToolCallUnknown", (e) =>
                errorResult(tool.id, e.name, {}, `Error: unknown tool "${e.name}"`),
              ),
              Match.tag("ToolCallBadArgs", (e) =>
                errorResult(tool.id, e.name, e.raw, "Error: invalid JSON in tool arguments"),
              ),
              Match.tag("ToolCallFailed", (e) =>
                errorResult(tool.id, e.name, e.args, `Error: ${e.cause.message}`),
              ),
              Match.exhaustive,
            ),
          ),
          state: undefined,
        }),
      ),
      Match.orElse(() => Effect.succeed({ action: Pass, state: undefined })),
    ),
};
