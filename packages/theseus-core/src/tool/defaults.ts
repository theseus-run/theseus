import { Schema } from "effect";

/**
 * Canonical schemas for common tool contracts.
 *
 * These are explicit defaults: authors still spell out input/output/failure,
 * but common no-op/text contracts have one shared name.
 */
export const NoInput = Schema.Struct({});

export type NoInput = Schema.Schema.Type<typeof NoInput>;

export const TextOutput = Schema.String;

export type TextOutput = Schema.Schema.Type<typeof TextOutput>;

export const NoFailure = Schema.Never;

export type NoFailure = Schema.Schema.Type<typeof NoFailure>;
