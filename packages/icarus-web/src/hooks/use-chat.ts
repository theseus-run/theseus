/**
 * useChat — React hook managing chat state + WS client lifecycle.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { WsClient, ClientEvent } from "../lib/ws-client";
import type { DispatchEvent, AgentResult } from "../lib/ws-client";

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
  /** Last completed dispatchId — used for session continuity. */
  lastCompletedId?: string;
}

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------

const BLUEPRINT = {
  name: "icarus",
  systemPrompt:
    "You are a helpful coding assistant. Use your tools to explore and modify code. Be concise.",
  tools: [
    { name: "read_file", description: "", inputSchema: {} },
    { name: "list_dir", description: "", inputSchema: {} },
    { name: "glob", description: "", inputSchema: {} },
    { name: "grep", description: "", inputSchema: {} },
    { name: "outline", description: "", inputSchema: {} },
    { name: "search_replace", description: "", inputSchema: {} },
    { name: "write_file", description: "", inputSchema: {} },
    { name: "shell", description: "", inputSchema: {} },
  ],
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
        { id: nextId.current++, role, content, timestamp: Date.now(), ...(event !== undefined ? { event } : {}) },
      ]);
    },
    [],
  );

  const handleResult = useCallback(
    (result: AgentResult) => {
      if (result.content) {
        addMessage("assistant", result.content);
      }
      setRunning(false);
      if (sessionRef.current) {
        sessionRef.current.lastCompletedId = sessionRef.current.dispatchId;
        sessionRef.current.draining = false;
      }
    },
    [addMessage],
  );

  // Ref-stable event handler — avoids stale closure in subscriber
  const handleEventRef = useRef((_event: DispatchEvent) => {});
  handleEventRef.current = (event: DispatchEvent) => {
    if (event.agent && !agent) setAgent(event.agent);

    switch (event._tag) {
      case "Calling":
        setIteration(event.iteration);
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
          `[${event.agent}] <- ${event.tool}: ${truncate(event.content, 120)}`,
          event,
        );
        break;
      case "ToolError":
        addMessage(
          "event",
          `[${event.agent}] !! ${event.tool}: ${event.error._tag}`,
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
        handleResult(event.result);
        break;
    }
  };

  // Subscribe to events from the shared client
  useEffect(() => {
    if (!client) return;

    const unsub = client.subscribe((msg: ClientEvent) => {
      if (msg._tag === "Event") {
        handleEventRef.current(msg.event);
      } else if (msg._tag === "Error") {
        addMessage("system", `Error: ${msg.error.message}`);
        setRunning(false);
        sessionRef.current = null;
      }
    });

    return unsub;
  }, [client, addMessage]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!client?.connected) return;

      addMessage("user", text);

      const session = sessionRef.current;

      // Start new dispatch or inject into running one
      if (!session || !session.draining) {
        setRunning(true);
        const continueFrom = session?.lastCompletedId;
        const result = await client.dispatch(BLUEPRINT, text, continueFrom);
        if (result) {
          sessionRef.current = {
            dispatchId: result.dispatchId,
            draining: true,
            lastCompletedId: continueFrom,
          };
        } else {
          addMessage("system", "Failed to start dispatch");
          setRunning(false);
        }
      } else {
        client.inject(session.dispatchId, text);
      }
    },
    [client, addMessage],
  );

  const reset = useCallback(() => {
    sessionRef.current = null;
    setMessages([]);
    setRunning(false);
    setAgent("");
    setIteration(0);
  }, []);

  /** Load a past dispatch's conversation into the chat view. */
  const loadDispatch = useCallback(
    async (dispatchId: string) => {
      if (!client?.connected) return;

      // Reset state
      setMessages([]);
      setRunning(false);
      setAgent("");
      setIteration(0);

      // Fetch the snapshot messages (includes full conversation history)
      const msgs = await client.getMessages(dispatchId);
      const chatMsgs: ChatMessage[] = [];
      for (const m of msgs) {
        if (m.role === "system") continue; // skip system prompt
        chatMsgs.push({
          id: nextId.current++,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          timestamp: Date.now(),
        });
      }
      setMessages(chatMsgs);

      // Set session so follow-up messages continue from this dispatch
      sessionRef.current = {
        dispatchId,
        draining: false,
        lastCompletedId: dispatchId,
      };
    },
    [client],
  );

  return {
    messages,
    running,
    agent,
    iteration,
    sendMessage,
    reset,
    loadDispatch,
  };
}

const truncate = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1)}...` : s;
