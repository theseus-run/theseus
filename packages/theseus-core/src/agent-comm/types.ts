import { Schema } from "effect";

// ---------------------------------------------------------------------------
// DispatchGruntInput — orchestrator → grunt
// ---------------------------------------------------------------------------

export const DispatchGruntInputSchema = Schema.Struct({
  blueprint: Schema.String.annotate({
    description: "Runtime-owned blueprint name to dispatch.",
  }),
  task: Schema.String.annotate({
    description: "What the grunt should accomplish. Be specific.",
  }),
  criteria: Schema.Array(Schema.String).annotate({
    description: "How we know the task is done.",
  }),
  context: Schema.optional(
    Schema.String.annotate({
      description: "File paths, inline data, or references.",
    }),
  ),
});

/** Structured input for the theseus_dispatch_grunt tool. */
export type DispatchGruntInput = Schema.Schema.Type<typeof DispatchGruntInputSchema>;

// ---------------------------------------------------------------------------
// ReportInput — worker → orchestrator
// ---------------------------------------------------------------------------

export const ReportInputSchema = Schema.Struct({
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

/** Structured input for the theseus.report tool. */
export type ReportInput = Schema.Schema.Type<typeof ReportInputSchema>;
