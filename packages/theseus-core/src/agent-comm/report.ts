/**
 * theseus.report — worker completion payload tool.
 *
 * Raw dispatch treats this like any other tool. Agent/grunt completion semantics
 * are protocol-level behavior and should be implemented outside the dispatch
 * primitive.
 *
 * Three result channels:
 *   success — task completed, content is the deliverable
 *   error   — not completed but actionable (file missing, spec ambiguous)
 *   defect  — infrastructure broken (tool crashed, capsule corrupted)
 */

import { Effect, Schema } from "effect";
import { Defaults, defineTool } from "../tool/index.ts";
import { type ReportInput, ReportInputSchema } from "./types.ts";

export const decodeReportInput = (input: unknown): Effect.Effect<ReportInput, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(ReportInputSchema)(input);

/**
 * The theseus.report tool. Add to worker Blueprint's tools array when the
 * worker should emit structured completion data.
 */
export const report = defineTool({
  name: "theseus_report",
  description:
    "Report structured results. Call when done (success), stuck on a real problem (error), or infrastructure is broken (defect). After calling this tool, stop.",
  input: ReportInputSchema,
  output: Defaults.TextOutput,
  failure: Defaults.NoFailure,
  policy: { interaction: "pure" },
  execute: ({ result, summary }) => Effect.succeed(`Report: ${result} — ${summary}`),
});
