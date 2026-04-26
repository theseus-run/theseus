/**
 * Event serialization — handles ToolCallError.cause which may be non-serializable.
 *
 * Returns a plain JSON-safe object matching DispatchEventSchema.
 */

import type { DispatchEvent } from "@theseus.run/core/Dispatch";

export type SerializedDispatchEvent = DispatchEvent | Record<string, unknown>;

export const serializeEvent = (event: DispatchEvent): SerializedDispatchEvent => {
  if (event._tag === "ToolError") {
    const { error, ...rest } = event;
    return {
      ...rest,
      error: {
        _tag: error._tag,
        callId: error.callId,
        name: error.name,
        ...("raw" in error ? { raw: error.raw } : {}),
        ...("args" in error ? { args: error.args } : {}),
        ...("cause" in error
          ? {
              cause: {
                _tag: (error.cause as { _tag?: string })?._tag,
                message: String(error.cause),
              },
            }
          : {}),
      },
    };
  }
  return event;
};
