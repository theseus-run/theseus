/**
 * WebSocket client for the icarus-web bridge server.
 *
 * Sends/receives plain JSON messages matching the daemon BridgeRequest/BridgeResponse
 * protocol, minus the length-prefix framing (WebSocket handles framing).
 */

export type Listener = (msg: BridgeResponse) => void;

export interface DispatchSummary {
  dispatchId: string;
  agent: string;
  task: string;
  startedAt: number;
  completedAt: number | null;
  status: "running" | "done" | "failed";
  usage: { inputTokens: number; outputTokens: number };
}

export interface CapsuleEvent {
  type: string;
  at: string;
  by: string;
  data: unknown;
}

export interface BridgeResponse {
  _tag: string;
  id: string;
  dispatchId?: string;
  capsuleId?: string;
  event?: DispatchEvent;
  result?: AgentResult;
  error?: { code: string; message: string };
  dispatches?: DispatchSummary[] | Array<{
    dispatchId: string;
    agent: string;
    iteration: number;
    state: string;
  }>;
  events?: Array<{ dispatchId: string; timestamp: number; event: DispatchEvent }> | CapsuleEvent[];
}

export interface DispatchEvent {
  _tag: string;
  agent: string;
  iteration?: number;
  content?: string;
  tool?: string;
  args?: unknown;
  error?: { _tag: string; message?: string };
  satellite?: string;
  phase?: string;
  action?: string;
  injection?: string;
  detail?: string;
  result?: AgentResult;
}

export interface AgentResult {
  result: string;
  summary: string;
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

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
      this.emit({ _tag: "Connected", id: "" } as BridgeResponse);
    };

    ws.onclose = () => {
      this._connected = false;
      this.ws = null;
      this.emit({ _tag: "Disconnected", id: "" } as BridgeResponse);
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

  private emit(msg: BridgeResponse) {
    for (const l of this.listeners) l(msg);
  }

  private send(msg: Record<string, unknown>): string {
    const id = makeId();
    msg.id = id;
    this.ws?.send(JSON.stringify(msg));
    return id;
  }

  /** Send a request and wait for the correlated response. */
  private request(msg: Record<string, unknown>): Promise<BridgeResponse> {
    return new Promise((resolve) => {
      const id = this.send(msg);
      // Timeout after 30s
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        resolve({ _tag: "Error", id, error: { code: "TIMEOUT", message: "Request timed out" } });
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
  ): Promise<{ dispatchId: string } | null> {
    const resp = await this.request({ _tag: "Dispatch", blueprint, task });
    if (resp._tag === "Ack" && resp.dispatchId) {
      return { dispatchId: resp.dispatchId };
    }
    return null;
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

  async status() {
    return this.request({ _tag: "Status" });
  }

  shutdown() {
    this.send({ _tag: "Shutdown", graceful: true });
  }

  async listDispatches(limit?: number): Promise<DispatchSummary[]> {
    const resp = await this.request({ _tag: "ListDispatches", ...(limit !== undefined ? { limit } : {}) });
    if (resp._tag === "DispatchList" && resp.dispatches) {
      return resp.dispatches as DispatchSummary[];
    }
    return [];
  }

  async getDispatchEvents(dispatchId: string) {
    const resp = await this.request({ _tag: "GetDispatchEvents", dispatchId });
    if (resp._tag === "DispatchEventsInfo" && resp.events) {
      return resp.events;
    }
    return [];
  }

  async getCapsuleEvents(capsuleId: string): Promise<CapsuleEvent[]> {
    const resp = await this.request({ _tag: "GetCapsuleEvents", capsuleId });
    if (resp._tag === "CapsuleEventsInfo" && resp.events) {
      return resp.events as CapsuleEvent[];
    }
    return [];
  }
}
