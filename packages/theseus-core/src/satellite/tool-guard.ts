/**
 * Tool guard satellite — block specific tools from executing.
 */

import { Effect } from "effect";
import { textPresentation } from "../tool/index.ts";
import type { Satellite } from "./types.ts";
import { BlockTool, Pass } from "./types.ts";

export const toolGuard = (blocked: ReadonlyArray<string>): Satellite => ({
  name: "tool-guard",
  open: () => Effect.void,
  beforeTool: (phase) => {
    return blocked.includes(phase.tool.name)
      ? Effect.succeed({
          decision: BlockTool(
            textPresentation(`Tool "${phase.tool.name}" is blocked by policy`, { isError: true }),
          ),
          state: undefined,
        })
      : Effect.succeed({ decision: Pass, state: undefined });
  },
});
