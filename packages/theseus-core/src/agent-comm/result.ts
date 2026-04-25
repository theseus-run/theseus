import { Schema } from "effect";
import { UsageSchema } from "../dispatch/types.ts";
import { ReportSchema } from "./report.ts";

export const SalvageSchema = Schema.Struct({
  summary: Schema.String,
  content: Schema.String,
});

export type Salvage = Schema.Schema.Type<typeof SalvageSchema>;

export const DispatchGruntResultSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("Reported"),
    target: Schema.String,
    dispatchId: Schema.String,
    report: ReportSchema,
    usage: UsageSchema,
  }),
  Schema.Struct({
    _tag: Schema.Literal("Unstructured"),
    target: Schema.String,
    dispatchId: Schema.String,
    reason: Schema.String,
    salvage: SalvageSchema,
    usage: UsageSchema,
  }),
]);

export type DispatchGruntResult = Schema.Schema.Type<typeof DispatchGruntResultSchema>;
