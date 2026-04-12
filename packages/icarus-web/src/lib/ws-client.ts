/**
 * WebSocket client for the icarus-web bridge server.
 *
 * Sends/receives plain JSON messages matching the daemon BridgeRequest/BridgeResponse
 * protocol, minus the length-prefix framing (WebSocket handles framing).
 *
 * Types are imported from @theseus.run/core — no local redefinitions.
 */

import type { BridgeResponse } from "@theseus.run/core/Daemon";
import type { Event as DispatchEvent, DispatchSummary } from "@theseus.run/core/Dispatch";
import type { Event as CapsuleEvent } from "@theseus.run/core/Capsule";
import type { Result as AgentResult } from "@theseus.run/core/Agent";

// Re-export core types for convenience (using their canonical names)
export type { BridgeResponse, DispatchSummary, CapsuleEvent, DispatchEvent, AgentResult };

// ---------------------------------------------------------------------------
// ClientEvent — BridgeResponse + synthetic connection events
// ---------------------------------------------------------------------------

export type ClientEvent =
  | BridgeResponse
  | { readonly _tag: "Connected"; readonly id: string }
  | { readonly _tag: "Disconnected"; readonly id: string };

export type Listener = (msg: ClientEvent) => void;

// ---------------------------------------------------------------------------
// WsClient
// ---------------------------------------------------------------------------

let reqCounter = 0;
const makeId = () => `req-${++reqCounter}-${Date.now().toString(36)}`;

export class WsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pendingCallbacks = new Map<string, (resp: BridgeResponse) => void>();
  private _connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private url: string) {}

  get connected() {
    return this._connected;
  }

  connect() {
    if (this.ws) return;
    const ws = new WebSocket(this.url);

    ws.onopen = () => {
      this._connected = true;
      this.emit({ _tag: "Connected", id: "" });
    };

    ws.onclose = () => {
      this._connected = false;
      this.ws = null;
      this.emit({ _tag: "Disconnected", id: "" });
      // Auto-reconnect after 2s
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as BridgeResponse;
        // Check for pending one-shot callback
        const cb = this.pendingCallbacks.get(msg.id);
        if (cb && msg._tag !== "Event") {
          this.pendingCallbacks.delete(msg.id);
          cb(msg);
        }
        this.emit(msg);
      } catch {
        // ignore parse errors
      }
    };

    this.ws = ws;
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(msg: ClientEvent) {
    for (const l of this.listeners) l(msg);
  }

  private send(msg: Record<string, unknown>): string {
    const id = makeId();
    msg["id"] = id;
    this.ws?.send(JSON.stringify(msg));
    return id;
  }

  /** Send a request and wait for the correlated response. */
  private request(msg: Record<string, unknown>): Promise<BridgeResponse> {
    return new Promise((resolve, reject) => {
      const id = this.send(msg);
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new Error("Request timed out"));
      }, 30_000);
      this.pendingCallbacks.set(id, (resp) => {
        clearTimeout(timer);
        resolve(resp);
      });
    });
  }

  async dispatch(
    blueprint: { name: string; systemPrompt: string; tools: unknown[]; maxIterations?: number },
    task: string,
    continueFrom?: string,
  ): Promise<{ dispatchId: string } | null> {
    try {
      const resp = await this.request({
        _tag: "Dispatch",
        blueprint,
        task,
        ...(continueFrom !== undefined ? { continueFrom } : {}),
      });
      if (resp._tag === "Ack" && resp.dispatchId) {
        return { dispatchId: resp.dispatchId };
      }
      return null;
    } catch {
      return null;
    }
  }

  inject(dispatchId: string, text: string) {
    this.send({
      _tag: "Inject",
      dispatchId,
      injection: {
        _tag: "AppendMessages",
        messages: [{ role: "user", content: text }],
      },
    });
  }

  ping() {
    this.send({ _tag: "Ping" });
  }

  async status(): Promise<BridgeResponse | null> {
    try {
      return await this.request({ _tag: "Status" });
    } catch {
      return null;
    }
  }

  shutdown() {
    this.send({ _tag: "Shutdown", graceful: true });
  }

  async listDispatches(limit?: number): Promise<ReadonlyArray<DispatchSummary>> {
    try {
      const resp = await this.request({ _tag: "ListDispatches", ...(limit !== undefined ? { limit } : {}) });
      return resp._tag === "DispatchList" ? resp.dispatches : [];
    } catch {
      return [];
    }
  }

  async getDispatchEvents(dispatchId: string) {
    try {
      const resp = await this.request({ _tag: "GetDispatchEvents", dispatchId });
      return resp._tag === "DispatchEventsInfo" ? resp.events : [];
    } catch {
      return [];
    }
  }

  async getMessages(dispatchId: string): Promise<ReadonlyArray<{ role: string; content: string }>> {
    try {
      const resp = await this.request({ _tag: "GetMessages", dispatchId });
      if (resp._tag === "Messages") {
        return resp.messages;
      }
      return [];
    } catch {
      return [];
    }
  }

  async getCapsuleEvents(capsuleId: string): Promise<ReadonlyArray<CapsuleEvent>> {
    try {
      const resp = await this.request({ _tag: "GetCapsuleEvents", capsuleId });
      return resp._tag === "CapsuleEventsInfo" ? resp.events : [];
    } catch {
      return [];
    }
  }
}
