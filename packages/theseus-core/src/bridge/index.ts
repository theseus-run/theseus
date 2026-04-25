/**
 * Bridge - adapter for Theseus tools -> effect/unstable/ai tools.
 *
 * Only tools need bridging. Messages use Prompt.MessageEncoded natively.
 */
export {
  toAiTool,
  toAiToolkit,
  toolsArrayToAiToolkit,
} from "./to-ai-tools.ts";
