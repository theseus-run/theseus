/**
 * Shared typed failure for theseus-tools.
 *
 * Most filesystem/shell tools fail with a simple diagnostic string.
 * This failure type is folded into the Presentation (isError: true) by
 * the callTool pipeline, so the LLM sees a clean tool-result error.
 */

import { Schema } from "effect";

export class ToolFailure extends Schema.TaggedErrorClass<ToolFailure>()(
  "ToolFailure",
  { message: Schema.String },
) {}
