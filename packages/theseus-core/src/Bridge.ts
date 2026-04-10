/**
 * Bridge — namespace barrel for `import * as Bridge from "@theseus.run/core/Bridge"`
 *
 * Adapter layer between Theseus tools and effect/unstable/ai tools.
 * Only tools need bridging — messages use Prompt.MessageEncoded natively.
 *
 * Usage:
 *   import * as Bridge from "@theseus.run/core/Bridge"
 *
 *   const toolkit = Bridge.toolsToToolkit(tools)
 *   const aiTool = Bridge.toolToAiTool(myTool)
 */

// ---------------------------------------------------------------------------
// Functions (drop "theseus" prefix — namespace provides it)
// ---------------------------------------------------------------------------

export {
  extractToolDefs,
  theseusToolsToToolkit as toolsToToolkit,
  theseusToolToAiTool as toolToAiTool,
} from "./bridge/to-ai-tools.ts";
