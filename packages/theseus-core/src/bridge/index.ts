/**
 * Bridge — adapter for Theseus tools → effect/unstable/ai tools.
 *
 * Only tools need bridging. Messages use Prompt.MessageEncoded natively.
 */

export type { ToolDefinition } from "./to-ai-tools.ts";
export {
  toAiTool,
  toAiToolkit,
  toolsArrayToAiToolkit,
  toToolDefinitions,
} from "./to-ai-tools.ts";
