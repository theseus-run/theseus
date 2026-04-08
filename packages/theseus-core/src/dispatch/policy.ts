/**
 * ToolCallPolicy — injectable service that decides how to handle tool call errors.
 *
 * The dispatch loop calls policy.recover() for each failed tool call.
 * The policy can:
 *   - Surface the error to the LLM as a string (default)
 *   - Bail with AgentError (fail fast)
 *   - Log, count, or transform the error
 *
 * Provided via Effect's R channel — swap via Layer composition.
 */

import { Effect, Layer, Match } from "effect";
import * as ServiceMap from "effect/ServiceMap";
import type { AgentError } from "../agent/index.ts";
import type { ToolCallError, ToolCallResult } from "./types.ts";

// ---------------------------------------------------------------------------
// ToolCallPolicy — service definition
// ---------------------------------------------------------------------------

export class ToolCallPolicy extends ServiceMap.Service<
  ToolCallPolicy,
  {
    /** Handle a tool call error. Return a ToolCallResult to surface to LLM, or fail to bail. */
    readonly recover: (error: ToolCallError) => Effect.Effect<ToolCallResult, AgentError>;
  }
>()("ToolCallPolicy") {}

// ---------------------------------------------------------------------------
// Default policy — surface all errors to LLM as string content
// ---------------------------------------------------------------------------

const defaultRecover = (err: ToolCallError): Effect.Effect<ToolCallResult, never> =>
  Effect.succeed(
    Match.value(err).pipe(
      Match.tag("ToolCallUnknown", (e) => ({
        callId: e.callId,
        name: e.name,
        args: undefined as unknown,
        content: `Error: unknown tool "${e.name}"`,
      })),
      Match.tag("ToolCallBadArgs", (e) => ({
        callId: e.callId,
        name: e.name,
        args: e.raw as unknown,
        content: "Error: invalid JSON in tool arguments",
      })),
      Match.tag("ToolCallFailed", (e) => ({
        callId: e.callId,
        name: e.name,
        args: e.args,
        content: `Error: ${e.cause.message}`,
      })),
      Match.exhaustive,
    ),
  );

export const DefaultToolCallPolicy = Layer.succeed(ToolCallPolicy, {
  recover: defaultRecover,
});
