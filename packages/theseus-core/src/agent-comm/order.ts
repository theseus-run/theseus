import { Schema } from "effect";

const OptionalStringArraySchema = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)));

export const ContextBlockSchema = Schema.Struct({
  kind: Schema.Literals(["fact", "constraint", "reference", "finding", "instruction"]),
  text: Schema.String,
  label: Schema.optional(Schema.String),
});

export type ContextBlock = Schema.Schema.Type<typeof ContextBlockSchema>;

export const AuthoritySchema = Schema.Struct({
  grantRefs: OptionalStringArraySchema.annotate({
    description: "Runtime-enforced capability or policy grant references.",
  }),
  actions: OptionalStringArraySchema,
  tools: OptionalStringArraySchema,
  limits: OptionalStringArraySchema,
  escalation: OptionalStringArraySchema,
});

export type Authority = Schema.Schema.Type<typeof AuthoritySchema>;

export const BoundsSchema = Schema.Struct({
  scope: OptionalStringArraySchema.annotate({
    description: "Explicit in-scope or out-of-scope boundaries.",
  }),
  constraints: OptionalStringArraySchema.annotate({
    description: "Rules, exclusions, or hard limits.",
  }),
});

export type Bounds = Schema.Schema.Type<typeof BoundsSchema>;

/**
 * Order — commander -> actor tasking packet.
 *
 * This is intentionally protocol-level, not coding-specific. Doctrine can
 * refine evidence and report expectations per domain later.
 */
export const OrderSchema = Schema.Struct({
  objective: Schema.String.annotate({
    description: "The concrete objective for the target actor.",
  }),
  intent: Schema.optional(
    Schema.String.annotate({
      description: "Why this objective matters; commander intent for adaptation.",
    }),
  ),
  successCriteria: Schema.Array(Schema.String).annotate({
    description: "How completion will be judged.",
  }),
  bounds: Schema.optional(BoundsSchema),
  context: Schema.optional(
    Schema.Array(ContextBlockSchema).annotate({
      description: "Structured facts, references, findings, and instructions.",
    }),
  ),
  authority: Schema.optional(AuthoritySchema),
  expectedReport: Schema.optional(
    Schema.String.annotate({
      description: "Freeform report expectations until domain-specific schemas exist.",
    }),
  ),
});

export type Order = Schema.Schema.Type<typeof OrderSchema>;

export const DispatchGruntInputSchema = Schema.Struct({
  target: Schema.String.annotate({
    description: "Runtime-owned grunt blueprint name to dispatch.",
  }),
  order: OrderSchema,
});

export type DispatchGruntInput = Schema.Schema.Type<typeof DispatchGruntInputSchema>;
