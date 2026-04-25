/**
 * Thin RPC client for the Theseus server.
 *
 * Speaks the Effect RPC wire protocol over WebSocket without importing Effect.
 * Messages are JSON-encoded with the structure:
 *   Request:  { _tag: "Request", id, tag, payload, headers }
 *   Chunk:    { _tag: "Chunk", requestId, values: [...] }
 *   Exit:     { _tag: "Exit", requestId, exit: { _tag: "Success"|"Failure", ... } }
 *
 * For streaming RPCs, chunks arrive as the dispatch runs.
 * For non-streaming RPCs, the result comes in the Exit message.
 */

import type { CapsuleEvent } from "@theseus.run/core/Capsule";
import type { DispatchSummary } from "@theseus.run/core/Dispatch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Serialized dispatch event matching DispatchEventSchema */
export interface DispatchEvent {
  readonly _tag: string;
  readonly name?: string;
  readonly iteration?: number;
  readonly tool?: string;
  readonly content?: string;
  readonly args?: unknown;
  readonly error?: unknown;
  readonly satellite?: string;
  readonly phase?: string;
  readonly action?: string;
  readonly injection?: string;
  readonly detail?: string;
  readonly result?: {
    readonly dispatchId: string;
    readonly name: string;
    readonly content: string;
    readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  };
}

export interface Message {
  readonly role: string;
  readonly content: string;
}

export type ConnectionState = "connecting" | "connected" | "disconnected";
export type ConnectionListener = (state: ConnectionState) => void;

// ---------------------------------------------------------------------------
// RPC wire protocol helpers
// ---------------------------------------------------------------------------

let reqCounter = 0;
const makeId = () => `${++reqCounter}`;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onChunk?: (values: unknown[]) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// ---------------------------------------------------------------------------
// TheseusClient
// ---------------------------------------------------------------------------

export class TheseusClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private _state: ConnectionState = "disconnected";
  private stateListeners = new Set<ConnectionListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private url: string) {}

  get state() {
    return this._state;
  }
  get connected() {
    return this._state === "connected";
  }

  onStateChange(listener: ConnectionListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private setState(state: ConnectionState) {
    this._state = state;
    for (const l of this.stateListeners) l(state);
  }

  connect() {
    if (this.ws) return;
    this.setState("connecting");

    const ws = new WebSocket(this.url);

    ws.onopen = () => this.setState("connected");

    ws.onclose = () => {
      this.setState("disconnected");
      this.ws = null;
      // Reject all pending requests
      for (const [id, req] of this.pending) {
        req.reject(new Error("Connection closed"));
        this.pending.delete(id);
      }
      // Auto-reconnect
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };

    ws.onerror = () => {
      // onclose will fire
    };

    ws.onmessage = (ev) => {
      try {
        // RPC uses ndjson — each message may contain multiple JSON objects separated by newlines
        const text = ev.data as string;
        const lines = text.split("\n").filter(Boolean);
        for (const line of lines) {
          const msg = JSON.parse(line);
          this.handleMessage(msg);
        }
      } catch {
        // Single JSON message fallback
        try {
          const msg = JSON.parse(ev.data as string);
          this.handleMessage(msg);
        } catch {
          // ignore parse errors
        }
      }
    };

    this.ws = ws;
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.setState("disconnected");
  }

  private handleMessage(msg: unknown) {
    if (!isRecord(msg)) return;

    if (msg["_tag"] === "Chunk") {
      const req = this.pending.get(String(msg["requestId"] ?? ""));
      if (req?.onChunk) {
        req.onChunk(Array.isArray(msg["values"]) ? msg["values"] : []);
      }
    } else if (msg["_tag"] === "Exit") {
      const req = this.pending.get(String(msg["requestId"] ?? ""));
      if (req) {
        this.pending.delete(String(msg["requestId"] ?? ""));
        const exit = isRecord(msg["exit"]) ? msg["exit"] : {};
        if (exit["_tag"] === "Success") {
          req.resolve(exit["value"]);
        } else {
          // Failure — extract error
          const cause = Array.isArray(exit["cause"]) ? exit["cause"][0] : undefined;
          const error = isRecord(cause) && isRecord(cause["error"]) ? cause["error"] : undefined;
          req.reject(
            new Error(
              isRecord(error) && typeof error["message"] === "string"
                ? error["message"]
                : "RPC failed",
            ),
          );
        }
      }
    } else if (msg["_tag"] === "Pong") {
      // ignore pongs
    }
  }

  private send(tag: string, payload: unknown): string {
    const id = makeId();
    const msg = {
      _tag: "Request" as const,
      id,
      tag,
      payload,
      headers: [],
    };
    this.ws?.send(`${JSON.stringify(msg)}\n`);
    return id;
  }

  /** Send a non-streaming RPC request and await the result. */
  private request<T>(tag: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.send(tag, payload);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Request timed out"));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start a dispatch — streams events via callback.
   * Returns a promise that resolves when the dispatch completes.
   */
  dispatch(
    spec: {
      name: string;
      systemPrompt: string;
      tools: Array<{ name: string }>;
      maxIterations?: number;
    },
    task: string,
    onEvent: (event: DispatchEvent) => void,
    continueFrom?: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.send("dispatch", { spec, task, continueFrom });
      this.pending.set(id, {
        resolve: () => resolve(),
        reject,
        onChunk: (values) => {
          for (const v of values) {
            onEvent(v as DispatchEvent);
          }
        },
      });
    });
  }

  async listDispatches(limit?: number): Promise<ReadonlyArray<DispatchSummary>> {
    try {
      return await this.request<DispatchSummary[]>("listDispatches", { limit });
    } catch {
      return [];
    }
  }

  async getMessages(dispatchId: string): Promise<ReadonlyArray<Message>> {
    try {
      return await this.request<Message[]>("getMessages", { dispatchId });
    } catch {
      return [];
    }
  }

  async inject(dispatchId: string, text: string): Promise<void> {
    await this.request("inject", { dispatchId, text });
  }

  async interrupt(dispatchId: string): Promise<void> {
    await this.request("interrupt", { dispatchId });
  }

  async getCapsuleEvents(capsuleId: string): Promise<ReadonlyArray<CapsuleEvent>> {
    try {
      return await this.request<CapsuleEvent[]>("getCapsuleEvents", { capsuleId });
    } catch {
      return [];
    }
  }

  async status(): Promise<ReadonlyArray<unknown>> {
    try {
      return await this.request("status", undefined);
    } catch {
      return [];
    }
  }
}
