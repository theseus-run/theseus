/**
 * Tool guard satellite — block specific tools from executing.
 */

import { Effect } from "effect";
import type { Satellite } from "./types.ts";
import { BlockTool, Pass } from "./types.ts";

export const toolGuard = (blocked: ReadonlyArray<string>): Satellite => ({
  name: "tool-guard",
  initial: undefined,
  handle: (phase) => {
    if (phase._tag !== "BeforeTool") return Effect.succeed({ action: Pass, state: undefined });
    return blocked.includes(phase.tool.name)
      ? Effect.succeed({
          action: BlockTool(`Tool "${phase.tool.name}" is blocked by policy`),
          state: undefined,
        })
      : Effect.succeed({ action: Pass, state: undefined });
  },
});
