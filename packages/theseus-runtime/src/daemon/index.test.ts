import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import * as Dispatch from "@theseus.run/core/Dispatch";
import * as Daemon from "@theseus.run/core/Daemon";
import * as Tool from "@theseus.run/core/Tool";
import {
  makeMockLanguageModel, textParts,
} from "@theseus.run/core/test-utils/mock-language-model";
import { encodeFrame, FrameDecoder, decodeRequest, decodeResponse } from "./codec.ts";
import {
  socketPath, pidfilePath, writePidfile, readPidfile,
  removePidfile, isDaemonRunning, cleanupDaemonFiles,
} from "./lifecycle.ts";
import { DispatchRegistry, DispatchRegistryLive } from "./registry.ts";
import { DaemonServer, DaemonServerLive, ToolRegistry, makeToolRegistry } from "./server.ts";
import { makeDaemonBridgeClient } from "./client.ts";
import { TheseusDbLive, SqliteDispatchLog } from "../store/index.ts";
import * as Satellite from "@theseus.run/core/Satellite";
import { join } from "node:path";

// ===========================================================================
// Codec — length-prefixed framing
// ===========================================================================

describe("Codec", () => {
  test("encode/decode round-trip for BridgeRequest", () => {
    const req: Daemon.BridgeRequest = { _tag: "Ping", id: "test-1" };
    const frame = encodeFrame(req);
    const decoder = new FrameDecoder();
    const messages = decoder.push(frame);
    expect(messages).toHaveLength(1);
    expect(decodeRequest(messages[0])).toEqual(req);
  });

  test("encode/decode round-trip for BridgeResponse", () => {
    const resp: Daemon.BridgeResponse = { _tag: "Pong", id: "test-1" };
    const frame = encodeFrame(resp);
    const decoder = new FrameDecoder();
    const messages = decoder.push(frame);
    expect(messages).toHaveLength(1);
    expect(decodeResponse(messages[0])).toEqual(resp);
  });

  test("handles partial frames across multiple pushes", () => {
    const req: Daemon.BridgeRequest = { _tag: "Status", id: "test-2" };
    const frame = encodeFrame(req);
    const decoder = new FrameDecoder();

    // Split frame in the middle
    const half = Math.floor(frame.length / 2);
    const part1 = frame.subarray(0, half);
    const part2 = frame.subarray(half);

    expect(decoder.push(part1)).toHaveLength(0); // incomplete
    const messages = decoder.push(part2);
    expect(messages).toHaveLength(1);
    expect(decodeRequest(messages[0])).toEqual(req);
  });

  test("decodes multiple frames in a single push", () => {
    const req1: Daemon.BridgeRequest = { _tag: "Ping", id: "a" };
    const req2: Daemon.BridgeRequest = { _tag: "Ping", id: "b" };
    const combined = Buffer.concat([encodeFrame(req1), encodeFrame(req2)]);
    const decoder = new FrameDecoder();
    const messages = decoder.push(combined);
    expect(messages).toHaveLength(2);
    expect((messages[0] as any)?.id).toBe("a");
    expect((messages[1] as any)?.id).toBe("b");
  });

  test("decodeRequest returns null for non-objects", () => {
    expect(decodeRequest(null)).toBeNull();
    expect(decodeRequest("string")).toBeNull();
    expect(decodeRequest(42)).toBeNull();
    expect(decodeRequest({})).toBeNull(); // no _tag
  });
});

// ===========================================================================
// Lifecycle — pidfile and socket management
// ===========================================================================

const testWorkspace = "/tmp/theseus-daemon-test";

describe("Lifecycle", () => {
  beforeEach(() => cleanupDaemonFiles(testWorkspace));
  afterEach(() => cleanupDaemonFiles(testWorkspace));

  test("socketPath and pidfilePath are deterministic", () => {
    expect(socketPath(testWorkspace)).toBe(`${testWorkspace}/.theseus/daemon.sock`);
    expect(pidfilePath(testWorkspace)).toBe(`${testWorkspace}/.theseus/daemon.pid`);
  });

  test("writePidfile / readPidfile round-trip", () => {
    writePidfile(testWorkspace, 12345);
    expect(readPidfile(testWorkspace)).toBe(12345);
  });

  test("readPidfile returns null when no pidfile", () => {
    expect(readPidfile(testWorkspace)).toBeNull();
  });

  test("removePidfile cleans up", () => {
    writePidfile(testWorkspace, 99999);
    removePidfile(testWorkspace);
    expect(readPidfile(testWorkspace)).toBeNull();
  });

  test("isDaemonRunning detects stale pidfile", () => {
    // Write a pidfile with a PID that almost certainly doesn't exist
    writePidfile(testWorkspace, 999999);
    const result = isDaemonRunning(testWorkspace);
    expect(result.running).toBe(false);
    // Stale pidfile should be cleaned up
    expect(readPidfile(testWorkspace)).toBeNull();
  });

  test("isDaemonRunning returns false when no pidfile", () => {
    const result = isDaemonRunning(testWorkspace);
    expect(result).toEqual({ running: false, pid: null });
  });
});

// ===========================================================================
// Registry — dispatch tracking
// ===========================================================================

describe("DispatchRegistry", () => {
  const runRegistry = <A>(effect: Effect.Effect<A, any, DispatchRegistry>) =>
    Effect.runPromise(
      Effect.provide(effect, Layer.effect(DispatchRegistry)(DispatchRegistryLive)),
    );

  test("register and get", async () => {
    await runRegistry(Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      const mockHandle = { dispatchId: "d1", events: Stream.empty, inject: () => Effect.void, interrupt: Effect.void, result: Effect.void, messages: Effect.succeed([]) } as any;
      yield* registry.register(mockHandle, "test-agent");
      const got = yield* registry.get("d1");
      expect(got).toBe(mockHandle);
    }));
  });

  test("get returns null for unknown id", async () => {
    await runRegistry(Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      const got = yield* registry.get("nonexistent");
      expect(got).toBeNull();
    }));
  });

  test("list returns status entries", async () => {
    await runRegistry(Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      const mockHandle = { dispatchId: "d1" } as any;
      yield* registry.register(mockHandle, "agent-1");
      const entries = yield* registry.list();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.dispatchId).toBe("d1");
      expect(entries[0]!.agent).toBe("agent-1");
      expect(entries[0]!.state).toBe("running");
    }));
  });

  test("updateStatus changes entry", async () => {
    await runRegistry(Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      yield* registry.register({ dispatchId: "d1" } as any, "agent");
      yield* registry.updateStatus("d1", { state: "done", iteration: 5 });
      const entries = yield* registry.list();
      expect(entries[0]!.state).toBe("done");
      expect(entries[0]!.iteration).toBe(5);
    }));
  });

  test("remove deletes entry", async () => {
    await runRegistry(Effect.gen(function* () {
      const registry = yield* DispatchRegistry;
      yield* registry.register({ dispatchId: "d1" } as any, "agent");
      yield* registry.remove("d1");
      expect(yield* registry.size()).toBe(0);
    }));
  });
});

// ===========================================================================
// Server + Client — end-to-end over unix socket
// ===========================================================================

const e2eWorkspace = "/tmp/theseus-daemon-e2e";

const echoTool = Tool.define({
  name: "echo",
  description: "Echo a message",
  inputSchema: Tool.manualSchema(
    { type: "object", properties: { msg: { type: "string" } }, required: ["msg"] },
    (raw) => {
      const r = raw as { msg?: unknown };
      if (typeof r.msg !== "string") throw new Error("msg must be a string");
      return r as { msg: string };
    },
  ),
  safety: "readonly",
  capabilities: [],
  execute: ({ msg }) => Effect.succeed(msg),
  encode: (s) => s,
});

describe("Server + Client E2E", () => {
  let stopServer: (() => void) | null = null;

  afterEach(() => {
    stopServer?.();
    stopServer = null;
    cleanupDaemonFiles(e2eWorkspace);
  });

  const testDbPath = join(e2eWorkspace, ".theseus", "theseus.db");
  const testDbLayer = TheseusDbLive(testDbPath);
  const testLogLayer = Layer.provide(SqliteDispatchLog, testDbLayer);

  const startTestServer = (responses: any[]) =>
    Effect.gen(function* () {
      const server = yield* DaemonServer;
      yield* server.start(e2eWorkspace);
      return server;
    }).pipe(
      Effect.provide(
        Layer.provideMerge(
          Layer.effect(DaemonServer)(DaemonServerLive),
          Layer.mergeAll(
            makeMockLanguageModel(responses),
            testLogLayer,
            Satellite.DefaultRing,
            testDbLayer,
            Layer.succeed(ToolRegistry, makeToolRegistry([echoTool])),
            Layer.effect(DispatchRegistry)(DispatchRegistryLive),
          ),
        ),
      ),
    );

  test("ping/pong", async () => {
    const server = await Effect.runPromise(startTestServer([textParts("hi")]));
    stopServer = () => Effect.runFork(server.stop());

    const client = await Effect.runPromise(makeDaemonBridgeClient(e2eWorkspace));
    const status = await Effect.runPromise(client.status());
    expect(status.dispatches).toHaveLength(0);
  });

  test("dispatch and receive result", async () => {
    const server = await Effect.runPromise(startTestServer([textParts("hello world")]));
    stopServer = () => Effect.runFork(server.stop());

    const client = await Effect.runPromise(makeDaemonBridgeClient(e2eWorkspace));

    const handle = await Effect.runPromise(
      client.dispatch(
        { name: "test-agent", systemPrompt: "You are a test agent.", tools: [echoTool] },
        "say hello",
      ),
    );

    expect(handle.dispatchId).toBeDefined();

    // Collect a few events (take until Done or limit)
    const events: Dispatch.Event[] = [];
    await Effect.runPromise(
      Stream.tap(handle.events, (e) =>
        Effect.sync(() => { events.push(e); }),
      ).pipe(
        Stream.takeUntil((e) => e._tag === "Done"),
        Stream.runDrain,
      ),
    );

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e._tag === "Calling")).toBe(true);
  });
});

// ===========================================================================
// Protocol serialization
// ===========================================================================

describe("Protocol helpers", () => {
  test("serializeBlueprint strips tool functions", () => {
    const bp = {
      name: "test",
      systemPrompt: "hi",
      tools: [echoTool],
      maxIterations: 10,
    };
    const serialized = Daemon.serializeBlueprint(bp);
    expect(serialized.name).toBe("test");
    expect(serialized.tools).toHaveLength(1);
    expect(serialized.tools[0]!.name).toBe("echo");
    // Should not have execute function
    expect((serialized.tools[0] as any).execute).toBeUndefined();
  });

  test("serializeEvent handles ToolError", () => {
    const event: Dispatch.Event = {
      _tag: "ToolError",
      agent: "test",
      iteration: 0,
      tool: "fail",
      error: new Dispatch.ToolCallBadArgs({ callId: "c1", name: "fail", raw: "bad" }),
    };
    const serialized = Daemon.serializeEvent(event) as any;
    expect(serialized._tag).toBe("ToolError");
    expect(serialized.error._tag).toBe("ToolCallBadArgs");
  });

  test("serializeEvent passes through non-error events", () => {
    const event: Dispatch.Event = {
      _tag: "Calling",
      agent: "test",
      iteration: 0,
    };
    expect(Daemon.serializeEvent(event)).toEqual(event);
  });
});
