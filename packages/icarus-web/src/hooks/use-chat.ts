/**
 * useChat — React hook managing chat state + WS client lifecycle.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { WsClient, BridgeResponse, DispatchEvent, AgentResult } from "../lib/ws-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system" | "event";
  content: string;
  event?: DispatchEvent;
  timestamp: number;
}

interface Session {
  dispatchId: string;
  draining: boolean;
}

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------

const BLUEPRINT = {
  name: "icarus",
  systemPrompt:
    "You are a helpful coding assistant. Use your tools to explore and modify code. Be concise.",
  tools: [],
  maxIterations: 30,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(client: WsClient | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [agent, setAgent] = useState("");
  const [iteration, setIteration] = useState(0);

  const sessionRef = useRef<Session | null>(null);
  const nextId = useRef(0);

  const addMessage = useCallback(
    (role: ChatMessage["role"], content: string, event?: DispatchEvent) => {
      setMessages((prev) => [
        ...prev,
        { id: nextId.current++, role, content, event, timestamp: Date.now() },
      ]);
    },
    [],
  );

  // Subscribe to events from the shared client
  useEffect(() => {
    if (!client) return;

    const unsub = client.subscribe((msg: BridgeResponse) => {
      switch (msg._tag) {
        case "Event":
          handleEvent(msg.event!);
          break;
        // Result is already handled via the Done event inside handleEvent
        case "Error":
          addMessage("system", `Error: ${msg.error?.message ?? "unknown"}`);
          setRunning(false);
          sessionRef.current = null;
          break;
      }
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const handleEvent = useCallback(
    (event: DispatchEvent) => {
      if (event.agent && !agent) setAgent(event.agent);

      switch (event._tag) {
        case "Calling":
          setIteration(event.iteration ?? 0);
          setRunning(true);
          break;
        case "ToolCalling":
          addMessage(
            "event",
            `[${event.agent}] -> ${event.tool}(${truncate(JSON.stringify(event.args), 80)})`,
            event,
          );
          break;
        case "ToolResult":
          addMessage(
            "event",
            `[${event.agent}] <- ${event.tool}: ${truncate(event.content ?? "", 120)}`,
            event,
          );
          break;
        case "ToolError":
          addMessage(
            "event",
            `[${event.agent}] !! ${event.tool}: ${event.error?._tag ?? "error"}`,
            event,
          );
          break;
        case "SatelliteAction":
          addMessage(
            "event",
            `[${event.agent}] * ${event.satellite}: ${event.action}`,
            event,
          );
          break;
        case "Injected":
          addMessage(
            "event",
            `[${event.agent}] << ${event.injection}${event.detail ? `: ${truncate(event.detail, 80)}` : ""}`,
            event,
          );
          break;
        case "Done":
          handleResult(event.result!);
          break;
        // TextDelta, ThinkingDelta, Thinking — skipped (server doesn't send them)
      }
    },
    [addMessage, agent],
  );

  const handleResult = useCallback(
    (result: AgentResult) => {
      if (result.content) {
        addMessage("assistant", result.content);
      }
      setRunning(false);
      if (sessionRef.current) {
        sessionRef.current.draining = false;
      }
    },
    [addMessage],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!client?.connected) return;

      addMessage("user", text);

      const session = sessionRef.current;

      // Start new session or inject into existing
      if (!session || !session.draining) {
        setRunning(true);
        const result = await client.dispatch(BLUEPRINT, text);
        if (result) {
          sessionRef.current = { dispatchId: result.dispatchId, draining: true };
        } else {
          addMessage("system", "Failed to start dispatch");
          setRunning(false);
        }
      } else {
        client.inject(session.dispatchId, text);
      }
    },
    [addMessage],
  );

  const reset = useCallback(() => {
    sessionRef.current = null;
    setMessages([]);
    setRunning(false);
    setAgent("");
    setIteration(0);
  }, []);

  return {
    messages,
    running,
    agent,
    iteration,
    sendMessage,
    reset,
  };
}

const truncate = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1)}...` : s;
