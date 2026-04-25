/**
 * Token budget satellite — abort dispatch when cumulative token usage exceeds a cap.
 */

import { Effect } from "effect";
import type { Satellite } from "./types.ts";
import { Pass, SatelliteAbort } from "./types.ts";

export const tokenBudget = (maxTokens: number): Satellite<number> => ({
  name: "token-budget",
  open: () => Effect.succeed(0),
  afterCall: (phase, _ctx, used) => {
    const next = used + phase.stepResult.usage.inputTokens + phase.stepResult.usage.outputTokens;
    return next > maxTokens
      ? Effect.fail(
          new SatelliteAbort({
            satellite: "token-budget",
            reason: `${next}/${maxTokens} tokens used`,
          }),
        )
      : Effect.succeed({ decision: Pass, state: next });
  },
});
