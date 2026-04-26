/**
 * Event serialization — handles ToolCallError.cause which may be non-serializable.
 *
 * Returns a plain JSON-safe object matching DispatchEventSchema.
 */

import type { DispatchEvent } from "@theseus.run/core/Dispatch";
import type { RuntimeDispatchEvent } from "@theseus.run/runtime";

export type SerializedDispatchEvent = DispatchEvent | Record<string, unknown>;
export type SerializedRuntimeDispatchEvent = RuntimeDispatchEvent | Record<string, unknown>;

const serializeCause = (cause: unknown): Record<string, unknown> => {
  const tag =
    typeof cause === "object" && cause !== null && "_tag" in cause
      ? (cause as { readonly _tag: unknown })._tag
      : undefined;
  return tag === undefined ? { message: String(cause) } : { _tag: tag, message: String(cause) };
};

export const serializeEvent = (event: DispatchEvent): SerializedDispatchEvent => {
  if (event._tag === "ToolError") {
    const { error, ...rest } = event;
    const serialized: Record<string, unknown> = {
      ...rest,
      error: {
        _tag: error._tag,
        callId: error.callId,
        name: error.name,
        ...("raw" in error ? { raw: error.raw } : {}),
        ...("args" in error ? { args: error.args } : {}),
        ...("cause" in error ? { cause: serializeCause(error.cause) } : {}),
      },
    };
    return serialized;
  }
  return event;
};

export const serializeRuntimeEvent = (
  event: RuntimeDispatchEvent,
): SerializedRuntimeDispatchEvent => {
  if (event._tag !== "DispatchEvent") return event;
  return {
    ...event,
    event: serializeEvent(event.event),
  };
};
