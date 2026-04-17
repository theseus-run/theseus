/**
 * Bridge — namespace barrel for `import * as Bridge from "@theseus.run/core/Bridge"`
 *
 * Adapter layer between Theseus tools and effect/unstable/ai tools.
 * Only tools need bridging — messages use Prompt.MessageEncoded natively.
 *
 * Usage:
 *   import * as Bridge from "@theseus.run/core/Bridge"
 *
 *   const aiToolkit = Bridge.toAiToolkit(toolkit)
 *   const aiTool    = Bridge.toAiTool(myTool)
 *   const defs      = Bridge.toToolDefinitions(toolkit)  // for raw provider SDKs
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ToolDefinition } from "./bridge/to-ai-tools.ts";

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export {
  toAiTool,
  toAiToolkit,
  toolsArrayToAiToolkit,
  toToolDefinitions,
} from "./bridge/to-ai-tools.ts";
