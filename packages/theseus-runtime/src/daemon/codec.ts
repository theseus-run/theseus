/**
 * Codec — length-prefixed JSON framing for unix socket transport.
 *
 * Wire format: [4-byte big-endian uint32 length] [JSON payload bytes]
 *
 * This framing is transport-specific (unix socket). When we add WebSocket,
 * each WS message is one JSON payload — no framing layer needed.
 */

import type { BridgeRequest, BridgeResponse } from "@theseus.run/core/Daemon";

// ---------------------------------------------------------------------------
// Encode — object → framed Buffer
// ---------------------------------------------------------------------------

export const encodeFrame = (msg: BridgeRequest | BridgeResponse): Buffer => {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, "utf-8");
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
};

// ---------------------------------------------------------------------------
// FrameDecoder — stateful decoder for streaming byte chunks
// ---------------------------------------------------------------------------

/**
 * Accumulates incoming bytes and yields complete JSON messages.
 * Handles partial frames across multiple `push` calls.
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /** Push incoming data and return all complete messages decoded so far. */
  push(data: Buffer | Uint8Array): unknown[] {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(data)]);
    const messages: unknown[] = [];

    while (this.buffer.length >= 4) {
      const payloadLen = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + payloadLen) break; // incomplete frame

      const json = this.buffer.subarray(4, 4 + payloadLen).toString("utf-8");
      this.buffer = this.buffer.subarray(4 + payloadLen);

      try {
        messages.push(JSON.parse(json));
      } catch {
        // Malformed JSON — skip frame
      }
    }

    return messages;
  }

  /** Reset internal buffer (e.g. on reconnect). */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}

// ---------------------------------------------------------------------------
// Typed decode helpers
// ---------------------------------------------------------------------------

export const decodeRequest = (raw: unknown): BridgeRequest | null => {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as { _tag?: string };
  if (typeof obj._tag !== "string") return null;
  return raw as BridgeRequest;
};

export const decodeResponse = (raw: unknown): BridgeResponse | null => {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as { _tag?: string };
  if (typeof obj._tag !== "string") return null;
  return raw as BridgeResponse;
};
