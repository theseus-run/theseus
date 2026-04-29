/**
 * Browser RPC client for the Theseus server.
 *
 * React code consumes Promise/callback methods; transport, framing, retries,
 * schema codecs, and stream lifecycle are delegated to Effect RPC.
 */

import { TheseusRpc } from "@theseus.run/core/Rpc";
import { Effect, Exit, Layer, Scope, Stream } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Serialized dispatch event matching DispatchEventSchema */
export interface CortexSignal {
  readonly id: string;
  readonly nodeId: string;
  readonly slot:
    | "harness"
    | "workspace"
    | "mission"
    | "work-node"
    | "observations"
    | "history"
    | "recall";
  readonly authority: "system" | "developer" | "user" | "assistant" | "tool";
  readonly priority: number;
  readonly text: string;
}

export interface DispatchEvent {
  readonly _tag: string;
  readonly name?: string;
  readonly iteration?: number;
  readonly signals?: ReadonlyArray<CortexSignal>;
  readonly historyMessageCount?: number;
  readonly cortexMessageCount?: number;
  readonly promptMessageCount?: number;
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
  readonly detail?: string | null;
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
  readonly parentWorkNodeId?: string | null;
  readonly kind: "dispatch";
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly control: WorkNodeControlDescriptor;
  readonly dispatchId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly name: string;
  readonly modelRequest?: ModelRequest | null;
  readonly iteration: number;
  readonly state: WorkNodeState;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

export interface WorkNodeSession {
  readonly workNodeId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly parentWorkNodeId?: string | null;
  readonly kind: "dispatch" | "task" | "external";
  readonly relation: WorkNodeRelation;
  readonly label: string;
  readonly state: WorkNodeState;
  readonly control: WorkNodeControlDescriptor;
  readonly startedAt?: number | null;
  readonly completedAt?: number | null;
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
  readonly stop: WorkControlCapability;
  readonly requestStatus: WorkControlCapability;
}
export type ModelRequest =
  | {
      readonly provider: "openai";
      readonly model: string;
      readonly maxOutputTokens?: number | null;
      readonly reasoningEffort?: "low" | "medium" | "high" | "xhigh" | null;
      readonly textVerbosity?: "low" | "medium" | "high" | null;
    }
  | {
      readonly provider: "copilot";
      readonly model: string;
      readonly maxTokens?: number | null;
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
    }
  | {
      readonly _tag: "WorkNodeStateChanged";
      readonly workNodeId: string;
      readonly missionId: string;
      readonly state: WorkNodeState;
      readonly reason?: string | null;
    }
  | {
      readonly _tag: "RuntimeProcessFailed";
      readonly workNodeId: string;
      readonly missionId: string;
      readonly process: string;
      readonly reason: string;
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

type TheseusRpcClient = RpcClient.FromGroup<typeof TheseusRpc, unknown>;

interface ClientRuntime {
  readonly client: TheseusRpcClient;
  readonly scope: Scope.Closeable;
}

export class TheseusClient {
  private _state: ConnectionState = "disconnected";
  private stateListeners = new Set<ConnectionListener>();
  private runtime: Promise<ClientRuntime> | null = null;

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
    void this.getRuntime().catch(() => undefined);
  }

  disconnect() {
    const runtime = this.runtime;
    this.runtime = null;
    this.setState("disconnected");
    void runtime?.then(({ scope }) => Effect.runPromise(Scope.close(scope, Exit.void)));
  }

  private makeLayer() {
    const socketLayer = Layer.provide(
      Socket.layerWebSocket(this.url, { openTimeout: "10 seconds" }),
      Socket.layerWebSocketConstructorGlobal,
    );
    const protocolDeps = Layer.mergeAll(
      socketLayer,
      RpcSerialization.layerJson,
      Layer.succeed(RpcClient.ConnectionHooks)({
        onConnect: Effect.sync(() => this.setState("connected")),
        onDisconnect: Effect.sync(() => this.setState("disconnected")),
      }),
    );
    return Layer.provide(
      RpcClient.layerProtocolSocket({ retryTransientErrors: true }),
      protocolDeps,
    );
  }

  private getRuntime(): Promise<ClientRuntime> {
    if (this.runtime !== null) return this.runtime;
    this.setState("connecting");
    this.runtime = Effect.runPromise(
      Effect.gen(
        function* (this: TheseusClient) {
          const scope = yield* Scope.make();
          const context = yield* Layer.buildWithScope(this.makeLayer(), scope);
          const client = yield* RpcClient.make(TheseusRpc).pipe(
            Effect.provideService(Scope.Scope, scope),
            Effect.provideContext(context),
          );
          return { client, scope };
        }.bind(this),
      ),
    ).catch((cause) => {
      this.runtime = null;
      this.setState("disconnected");
      throw new Error(rpcErrorMessage(cause, "RPC client failed"));
    });
    return this.runtime;
  }

  private async run<A>(
    effect: (client: TheseusRpcClient) => Effect.Effect<A, unknown>,
  ): Promise<A> {
    const runtime = await this.getRuntime();
    try {
      return await Effect.runPromise(effect(runtime.client));
    } catch (cause) {
      throw new Error(rpcErrorMessage(cause, "RPC failed"));
    }
  }

  private async runStream<A>(
    stream: (client: TheseusRpcClient) => Stream.Stream<A, unknown>,
    onEvent: (event: A) => void,
  ): Promise<void> {
    const runtime = await this.getRuntime();
    try {
      await Effect.runPromise(
        Stream.runForEach(stream(runtime.client), (event) => Effect.sync(() => onEvent(event))),
      );
    } catch (cause) {
      throw new Error(rpcErrorMessage(cause, "RPC stream failed"));
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async listMissions(): Promise<ReadonlyArray<MissionSession>> {
    return await this.run((client) => client.listMissions(undefined));
  }

  async getMission(missionId: string): Promise<MissionSession | null> {
    return await this.run((client) => client.getMission({ missionId }));
  }

  async listRuntimeDispatches(limit?: number): Promise<ReadonlyArray<DispatchSession>> {
    return await this.run((client) => client.listRuntimeDispatches({ limit }));
  }

  async getMissionWorkTree(missionId: string): Promise<ReadonlyArray<WorkNodeSession>> {
    return await this.run((client) => client.getMissionWorkTree({ missionId }));
  }

  async getDispatchEvents(dispatchId: string): Promise<ReadonlyArray<DispatchEventEntry>> {
    return await this.run((client) => client.getDispatchEvents({ dispatchId }));
  }

  async startResearchPoc(
    input: { readonly goal: string },
    onEvent: (event: ResearchPocEvent) => void,
  ): Promise<void> {
    return await this.runStream((client) => client.startResearchPoc(input), onEvent);
  }
}
