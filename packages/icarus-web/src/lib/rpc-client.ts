/**
 * POC RPC client for the Theseus server.
 *
 * Speaks the current Effect RPC wire protocol over WebSocket without importing
 * Effect. This is smoke-tested scaffolding for the runtime POC, not the durable
 * browser client boundary.
 *
 * Messages are JSON-encoded with the structure:
 *   Request:  { _tag: "Request", id, tag, payload, headers }
 *   Chunk:    { _tag: "Chunk", requestId, values: [...] }
 *   Exit:     { _tag: "Exit", requestId, exit: { _tag: "Success"|"Failure", ... } }
 *
 * For streaming RPCs, chunks arrive as the dispatch runs.
 * For non-streaming RPCs, the result comes in the Exit message.
 */

import type { CapsuleEvent } from "@theseus.run/core/Capsule";

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
  readonly structured?: unknown;
  readonly args?: unknown;
  readonly error?: unknown;
  readonly isError?: boolean;
  readonly satellite?: string;
  readonly phase?: string;
  readonly action?: string;
  readonly injection?: string;
  readonly detail?: string;
  readonly reason?: string;
  readonly result?: {
    readonly dispatchId: string;
    readonly name: string;
    readonly content: string;
    readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  };
}

export interface DispatchEventEntry {
  readonly dispatchId: string;
  readonly timestamp: number;
  readonly event: DispatchEvent;
}

export interface MissionSession {
  readonly missionId: string;
  readonly capsuleId: string;
  readonly goal: string;
  readonly criteria: ReadonlyArray<string>;
  readonly state: "pending" | "running" | "done" | "failed";
}

export interface DispatchSession {
  readonly workNodeId: string;
  readonly parentWorkNodeId?: string;
  readonly kind: "dispatch";
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly control: WorkNodeControlDescriptor;
  readonly dispatchId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly name: string;
  readonly modelRequest?: ModelRequest;
  readonly iteration: number;
  readonly state: WorkNodeState;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

export interface WorkNodeSession {
  readonly workNodeId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parentWorkNodeId?: string;
  readonly kind: "dispatch" | "task" | "external";
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly state: WorkNodeState;
  readonly control: WorkNodeControlDescriptor;
  readonly startedAt?: number;
  readonly completedAt?: number;
}

export type WorkNodeRelation = "root" | "delegated" | "continued" | "branched";
export type WorkNodeState =
  | "pending"
  | "running"
  | "paused"
  | "blocked"
  | "done"
  | "failed"
  | "aborted";
export type WorkControlCapability =
  | { readonly _tag: "Supported" }
  | { readonly _tag: "Unsupported"; readonly reason: string };
export interface WorkNodeControlDescriptor {
  readonly interrupt: WorkControlCapability;
  readonly injectGuidance: WorkControlCapability;
  readonly pause: WorkControlCapability;
  readonly resume: WorkControlCapability;
  readonly requestStatus: WorkControlCapability;
}
export type WorkControlCommand =
  | { readonly _tag: "Interrupt"; readonly reason?: string | undefined }
  | { readonly _tag: "InjectGuidance"; readonly text: string }
  | { readonly _tag: "Pause"; readonly reason?: string | undefined }
  | { readonly _tag: "Resume" }
  | { readonly _tag: "RequestStatus" };

export type ModelRequest =
  | {
      readonly provider: "openai";
      readonly model: string;
      readonly maxOutputTokens?: number;
      readonly reasoningEffort?: "low" | "medium" | "high" | "xhigh";
      readonly textVerbosity?: "low" | "medium" | "high";
    }
  | {
      readonly provider: "copilot";
      readonly model: string;
      readonly maxTokens?: number;
    };

export type RuntimeDispatchEvent =
  | {
      readonly _tag: "WorkNodeStarted";
      readonly node: WorkNodeSession;
    }
  | {
      readonly _tag: "DispatchSessionStarted";
      readonly session: DispatchSession;
    }
  | {
      readonly _tag: "DispatchEvent";
      readonly workNodeId: string;
      readonly dispatchId: string;
      readonly missionId: string;
      readonly capsuleId: string;
      readonly event: DispatchEvent;
    };

export type ResearchPocEvent =
  | {
      readonly _tag: "MissionCreated";
      readonly mission: MissionSession;
    }
  | RuntimeDispatchEvent;

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
  timeout?: ReturnType<typeof setTimeout>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const rpcErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined ? fallback : rpcErrorMessage(first, fallback);
  }
  if (isRecord(value)) {
    const message = value["message"];
    if (typeof message === "string") return message;
    const pretty = value["pretty"];
    if (typeof pretty === "string") return pretty;
    const error = value["error"];
    if (error !== undefined) return rpcErrorMessage(error, fallback);
    const cause = value["cause"];
    if (cause !== undefined) return rpcErrorMessage(cause, fallback);
    const failure = value["failure"];
    if (failure !== undefined) return rpcErrorMessage(failure, fallback);
    const defect = value["defect"];
    if (defect !== undefined) return rpcErrorMessage(defect, fallback);
    const tag = value["_tag"];
    if (typeof tag === "string") {
      const reason = value["reason"];
      if (typeof reason === "string") return `${tag}: ${reason}`;
      const code = value["code"];
      if (typeof code === "string") return `${tag}: ${code}`;
      return tag;
    }
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? fallback : encoded;
};

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
      const requestId = String(msg["requestId"] ?? "");
      const req = this.pending.get(requestId);
      if (req?.onChunk) {
        req.onChunk(Array.isArray(msg["values"]) ? msg["values"] : []);
      }
      this.ack(requestId);
    } else if (msg["_tag"] === "Exit") {
      const req = this.pending.get(String(msg["requestId"] ?? ""));
      if (req) {
        this.pending.delete(String(msg["requestId"] ?? ""));
        if (req.timeout) clearTimeout(req.timeout);
        const exit = isRecord(msg["exit"]) ? msg["exit"] : {};
        if (exit["_tag"] === "Success") {
          req.resolve(exit["value"]);
        } else {
          req.reject(new Error(rpcErrorMessage(exit, "RPC failed")));
        }
      }
    } else if (msg["_tag"] === "Defect") {
      const error = new Error(rpcErrorMessage(msg["defect"], "RPC server defect"));
      for (const [id, req] of this.pending) {
        this.pending.delete(id);
        if (req.timeout) clearTimeout(req.timeout);
        req.reject(error);
      }
    } else if (msg["_tag"] === "ClientProtocolError") {
      const error = new Error(rpcErrorMessage(msg["error"], "RPC protocol error"));
      for (const [id, req] of this.pending) {
        this.pending.delete(id);
        if (req.timeout) clearTimeout(req.timeout);
        req.reject(error);
      }
    } else if (msg["_tag"] === "Pong") {
      // ignore pongs
    }
  }

  private ack(requestId: string) {
    this.ws?.send(`${JSON.stringify({ _tag: "Ack", requestId })}\n`);
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

  private streamRequest<T>(
    tag: string,
    payload: unknown,
    onEvent: (event: T) => void,
    timeoutMessage: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.send(tag, payload);
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(timeoutMessage));
      }, 120_000);
      this.pending.set(id, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        timeout,
        onChunk: (values) => {
          for (const value of values) {
            onEvent(value as T);
          }
        },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async createMission(input: {
    readonly slug?: string;
    readonly goal: string;
    readonly criteria: ReadonlyArray<string>;
  }): Promise<MissionSession> {
    return await this.request<MissionSession>("createMission", input);
  }

  startMissionDispatch(
    input: {
      readonly missionId: string;
      readonly spec: {
        readonly name: string;
        readonly systemPrompt: string;
        readonly tools: ReadonlyArray<{ readonly name: string }>;
        readonly maxIterations?: number;
        readonly modelRequest?: ModelRequest;
      };
      readonly task: string;
      readonly continueFrom?: string;
    },
    onEvent: (event: RuntimeDispatchEvent) => void,
  ): Promise<void> {
    return this.streamRequest(
      "startMissionDispatch",
      input,
      onEvent,
      "Runtime dispatch stream timed out before completing",
    );
  }

  async listMissions(): Promise<ReadonlyArray<MissionSession>> {
    return await this.request<MissionSession[]>("listMissions", undefined);
  }

  async getMission(missionId: string): Promise<MissionSession | null> {
    return await this.request<MissionSession>("getMission", { missionId });
  }

  async listRuntimeDispatches(limit?: number): Promise<ReadonlyArray<DispatchSession>> {
    return await this.request<DispatchSession[]>("listRuntimeDispatches", { limit });
  }

  async getMissionWorkTree(missionId: string): Promise<ReadonlyArray<WorkNodeSession>> {
    return await this.request<WorkNodeSession[]>("getMissionWorkTree", { missionId });
  }

  async inject(dispatchId: string, text: string): Promise<void> {
    await this.request("inject", { dispatchId, text });
  }

  async interrupt(dispatchId: string): Promise<void> {
    await this.request("interrupt", { dispatchId });
  }

  async controlWorkNode(workNodeId: string, command: WorkControlCommand): Promise<void> {
    await this.request("controlWorkNode", { workNodeId, command });
  }

  async getDispatchResult(dispatchId: string): Promise<DispatchEvent["result"] | null> {
    return await this.request<DispatchEvent["result"]>("getResult", { dispatchId });
  }

  async getCapsuleEvents(capsuleId: string): Promise<ReadonlyArray<CapsuleEvent>> {
    return await this.request<CapsuleEvent[]>("getCapsuleEvents", { capsuleId });
  }

  async getDispatchCapsuleEvents(dispatchId: string): Promise<ReadonlyArray<CapsuleEvent>> {
    return await this.request<CapsuleEvent[]>("getDispatchCapsuleEvents", { dispatchId });
  }

  async getDispatchEvents(dispatchId: string): Promise<ReadonlyArray<DispatchEventEntry>> {
    return await this.request<DispatchEventEntry[]>("getDispatchEvents", { dispatchId });
  }

  startResearchPoc(
    input: { readonly goal: string },
    onEvent: (event: ResearchPocEvent) => void,
  ): Promise<void> {
    return this.streamRequest(
      "startResearchPoc",
      input,
      onEvent,
      "Research POC stream timed out before completing",
    );
  }

  async status(): Promise<ReadonlyArray<unknown>> {
    try {
      return await this.request("status", undefined);
    } catch {
      return [];
    }
  }
}
