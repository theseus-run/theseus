/**
 * Event serialization — handles ToolCallError.cause which may be non-serializable.
 *
 * Returns a plain JSON-safe object matching DispatchEventSchema.
 */

import type { DispatchEvent } from "@theseus.run/core/Dispatch";
import type { RuntimeDispatchEvent } from "@theseus.run/runtime";

export type SerializedDispatchEvent = DispatchEvent | Record<string, unknown>;
export type SerializedRuntimeDispatchEvent = RuntimeDispatchEvent | Record<string, unknown>;

export const jsonSafe = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, jsonSafe(entry)]),
  );
};

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
        ...("raw" in error ? { raw: jsonSafe(error.raw) } : {}),
        ...("args" in error ? { args: jsonSafe(error.args) } : {}),
        ...("cause" in error ? { cause: serializeCause(error.cause) } : {}),
      },
    };
    return jsonSafe(serialized) as Record<string, unknown>;
  }
  return jsonSafe(event) as SerializedDispatchEvent;
};

export const serializeRuntimeEvent = (
  event: RuntimeDispatchEvent,
): SerializedRuntimeDispatchEvent => {
  if (event._tag !== "DispatchEvent") return jsonSafe(event) as SerializedRuntimeDispatchEvent;
  return jsonSafe({
    ...event,
    event: serializeEvent(event.event),
  }) as SerializedRuntimeDispatchEvent;
};
