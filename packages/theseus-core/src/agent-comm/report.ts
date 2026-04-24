/**
 * theseus.report — worker completion tool.
 *
 * When a worker calls this tool, the dispatch loop intercepts it and
 * terminates with structured data. The execute function is a fallback
 * that's never reached in normal operation (dispatch loop catches it first).
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
 * The theseus.report tool. Add to worker Blueprint's tools array.
 *
 * The dispatch loop intercepts this tool by name and terminates.
 * The execute function below is a no-op fallback.
 */
export const report = defineTool<ReportInput>({
  name: "theseus_report",
  description:
    "Report results and terminate. Call when done (success), stuck on a real problem (error), or infrastructure is broken (defect). " +
    "This ends your work — do not call until you have completed the task or determined you cannot.",
  input: ReportInputSchema as unknown as Schema.Schema<ReportInput>,
  policy: { interaction: "pure" },
  // Never reached — dispatch loop intercepts. Fallback if somehow called directly.
  execute: ({ result, summary }) => Effect.succeed(`Report: ${result} — ${summary}`),
});
