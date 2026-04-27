import { Effect, Match, Schema } from "effect";
import { defineTool, textPresentation } from "../tool/index.ts";

const optionalNullable = <S extends Schema.Top>(schema: S) =>
  Schema.optional(Schema.NullOr(schema));

export const ReportChannelSchema = Schema.Literals(["complete", "blocked", "defect"]);

export type ReportChannel = Schema.Schema.Type<typeof ReportChannelSchema>;

export const EvidenceSchema = Schema.Struct({
  id: Schema.optional(Schema.String),
  kind: Schema.Literals([
    "observation",
    "artifact",
    "source",
    "measurement",
    "tool_result",
    "log",
    "reference",
    "note",
  ]),
  text: Schema.String,
  ref: Schema.optional(Schema.String),
});

export type Evidence = Schema.Schema.Type<typeof EvidenceSchema>;

export const ArtifactRefSchema = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.String,
  type: Schema.optional(Schema.String),
  uri: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  final: Schema.optional(Schema.Boolean),
  criteriaRefs: optionalNullable(Schema.Array(Schema.String)),
});

export type ArtifactRef = Schema.Schema.Type<typeof ArtifactRefSchema>;

export const CriterionSatisfactionSchema = Schema.Struct({
  criterion: Schema.String,
  status: Schema.Literals(["satisfied", "unsatisfied", "unknown"]),
  evidenceRefs: optionalNullable(Schema.Array(Schema.String)),
  notes: Schema.optional(Schema.String),
});

export type CriterionSatisfaction = Schema.Schema.Type<typeof CriterionSatisfactionSchema>;

export const FollowupSchema = Schema.Struct({
  risks: optionalNullable(Schema.Array(Schema.String)),
  next: Schema.optional(Schema.String),
});

export type Followup = Schema.Schema.Type<typeof FollowupSchema>;

/**
 * Report — terminal actor -> commander packet.
 *
 * complete: objective satisfied. blocked: actor operated correctly but cannot
 * complete as ordered. defect: protocol/runtime/infrastructure broke.
 */
export const ReportSchema = Schema.Struct({
  channel: ReportChannelSchema,
  summary: Schema.String,
  content: Schema.String,
  evidence: optionalNullable(Schema.Array(EvidenceSchema)),
  artifacts: optionalNullable(Schema.Array(ArtifactRefSchema)),
  satisfaction: optionalNullable(Schema.Array(CriterionSatisfactionSchema)),
  followup: Schema.optional(FollowupSchema),
});

export type Report = Schema.Schema.Type<typeof ReportSchema>;

/**
 * The theseus_report tool. Raw dispatch treats it like any other tool; agent
 * communication adapters decide whether a valid report is terminal.
 */
export const report = defineTool({
  name: "theseus_report",
  description:
    "Send the terminal protocol report: complete, blocked, or defect. Include evidence when possible. After calling this tool, stop.",
  input: ReportSchema,
  output: ReportSchema,
  failure: Schema.Never,
  policy: { interaction: "pure" },
  execute: (input) => Effect.succeed(input),
  present: (value) =>
    Effect.succeed(
      Match.value(value).pipe(
        Match.tag("Success", ({ output }) =>
          textPresentation(JSON.stringify(output), { structured: output }),
        ),
        Match.tag("Failure", ({ failure }) =>
          textPresentation(JSON.stringify(failure), { structured: failure }),
        ),
        Match.exhaustive,
      ),
    ),
});
