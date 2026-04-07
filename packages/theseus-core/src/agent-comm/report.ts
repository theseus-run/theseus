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

import { Effect } from "effect";
import { defineTool } from "../tool/index.ts";
import { fromZod } from "../tool/zod.ts";
import { z } from "zod";
import type { ReportInput } from "./types.ts";

const reportSchema = z.object({
  result: z.enum(["success", "error", "defect"]).describe(
    "success: task done. error: not done but actionable info. defect: infrastructure broken.",
  ),
  summary: z.string().describe("One-line summary of what happened."),
  content: z.string().describe("Full deliverable, error description, or defect details."),
});

/**
 * The theseus.report tool. Add to worker Blueprint's tools array.
 *
 * The dispatch loop intercepts this tool by name and terminates.
 * The execute function below is a no-op fallback.
 */
export const report = defineTool<ReportInput, string>({
  name: "theseus_report",
  description:
    "Report results and terminate. Call when done (success), stuck on a real problem (error), or infrastructure is broken (defect). " +
    "This ends your work — do not call until you have completed the task or determined you cannot.",
  inputSchema: fromZod(reportSchema),
  safety: "readonly",
  capabilities: [],
  // Never reached — dispatch loop intercepts. Fallback if somehow called directly.
  execute: ({ result, summary }) => Effect.succeed(`Report: ${result} — ${summary}`),
  encode: (s) => s,
});
