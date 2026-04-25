import { Schema } from "effect";

/**
 * ProtocolEnvelope — audit/correlation metadata for agent-comm packets.
 *
 * Early transports may omit this and let the runtime attach equivalent event
 * metadata. The protocol keeps the shape explicit so future ACK/SITREP/AMEND
 * packets have a common causality model.
 */
export const ProtocolEnvelopeSchema = Schema.Struct({
  version: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.String),
  packetId: Schema.optional(Schema.String),
  parentPacketId: Schema.optional(Schema.String),
  orderId: Schema.optional(Schema.String),
  sender: Schema.optional(Schema.String),
  recipient: Schema.optional(Schema.String),
  missionId: Schema.optional(Schema.String),
  dispatchId: Schema.optional(Schema.String),
  sequence: Schema.optional(Schema.Number),
  timestamp: Schema.optional(Schema.String),
  causality: Schema.optional(Schema.Array(Schema.String)),
});

export type ProtocolEnvelope = Schema.Schema.Type<typeof ProtocolEnvelopeSchema>;
