import { Schema } from "effect";
import { type Usage, UsageSchema } from "../dispatch/types.ts";
import { type Report, ReportSchema } from "./report.ts";

export const SalvageSchema = Schema.Struct({
  summary: Schema.String,
  content: Schema.String,
});

export type Salvage = Schema.Schema.Type<typeof SalvageSchema>;

export const DispatchGruntResultSchema = Schema.Union([
  Schema.TaggedStruct("Reported", {
    target: Schema.String,
    dispatchId: Schema.String,
    report: ReportSchema,
    usage: UsageSchema,
  }),
  Schema.TaggedStruct("Unstructured", {
    target: Schema.String,
    dispatchId: Schema.String,
    reason: Schema.String,
    salvage: SalvageSchema,
    usage: UsageSchema,
  }),
]);

export type DispatchGruntResult = Schema.Schema.Type<typeof DispatchGruntResultSchema>;

export const DispatchGruntResult = {
  reported: (input: {
    readonly target: string;
    readonly dispatchId: string;
    readonly report: Report;
    readonly usage: Usage;
  }): DispatchGruntResult => ({
    _tag: "Reported",
    ...input,
  }),

  unstructured: (input: {
    readonly target: string;
    readonly dispatchId: string;
    readonly reason: string;
    readonly salvage: Salvage;
    readonly usage: Usage;
  }): DispatchGruntResult => ({
    _tag: "Unstructured",
    ...input,
  }),
};
