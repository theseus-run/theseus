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
import { defineTool } from "../tool/index.ts";
import type { ReportInput } from "./types.ts";

const ReportInputSchema = Schema.Struct({
  result: Schema.Literals(["success", "error", "defect"]).annotate({
    description:
      "success: task done. error: not done but actionable info. defect: infrastructure broken.",
  }),
  summary: Schema.String.annotate({
    description: "One-line summary of what happened.",
  }),
  content: Schema.String.annotate({
    description: "Full deliverable, error description, or defect details.",
  }),
});

export const decodeReportInput = (input: unknown): Effect.Effect<ReportInput, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(ReportInputSchema as unknown as Schema.Schema<ReportInput>)(
    input,
  ) as Effect.Effect<ReportInput, Schema.SchemaError, never>;

/**
 * The theseus.report tool. Add to worker Blueprint's tools array when the
 * worker should emit structured completion data.
 */
export const report = defineTool<ReportInput>({
  name: "theseus_report",
  description:
    "Report structured results. Call when done (success), stuck on a real problem (error), or infrastructure is broken (defect). After calling this tool, stop.",
  input: ReportInputSchema as unknown as Schema.Schema<ReportInput>,
  policy: { interaction: "pure" },
  execute: ({ result, summary }) => Effect.succeed(`Report: ${result} — ${summary}`),
});
