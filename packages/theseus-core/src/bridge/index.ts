/**
 * Bridge — adapters between Theseus internal types and effect/unstable/ai.
 *
 * These bridges allow our dispatch loop and tools to interoperate with the
 * @effect/ai LanguageModel service without rewriting tool definitions.
 */

export { llmMessagesToPrompt } from "./to-prompt.ts";
export { responsePartsToStepResult } from "./from-response.ts";
export { theseusToolToAiTool, theseusToolsToToolkit, extractToolDefs } from "./to-ai-tools.ts";
