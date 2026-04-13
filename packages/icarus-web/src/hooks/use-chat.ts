/**
 * useChat — React hook managing chat state + RPC client lifecycle.
 */

import { useState, useCallback, useRef } from "react";
import type { TheseusClient, DispatchEvent } from "../lib/rpc-client";

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
    { name: "read_file" },
    { name: "list_dir" },
    { name: "glob" },
    { name: "grep" },
    { name: "outline" },
    { name: "search_replace" },
    { name: "write_file" },
    { name: "shell" },
  ],
  maxIterations: 30,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(client: TheseusClient | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [agent, setAgent] = useState("");
  const [iteration, setIteration] = useState(0);

  const sessionRef = useRef<Session>({});
  const nextId = useRef(0);

  const addMessage = useCallback(
    (role: ChatMessage["role"], content: string, event?: DispatchEvent) => {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role,
          content,
          timestamp: Date.now(),
          ...(event !== undefined ? { event } : {}),
        },
      ]);
    },
    [],
  );

  const handleEvent = useCallback(
    (event: DispatchEvent) => {
      if (event.agent && !agent) setAgent(event.agent ?? "");

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
            `[${event.agent}] !! ${event.tool}: ${JSON.stringify(event.error)}`,
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
          if (event.result?.content) {
            addMessage("assistant", event.result.content);
          }
          setRunning(false);
          break;
      }
    },
    [agent, addMessage],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!client?.connected) return;

      addMessage("user", text);
      setRunning(true);

      const continueFrom = sessionRef.current.lastCompletedId;

      try {
        // Track the dispatch ID from the Done event
        let lastDispatchResult: DispatchEvent | undefined;

        await client.dispatch(
          BLUEPRINT,
          text,
          (event) => {
            handleEvent(event);
            if (event._tag === "Done") {
              lastDispatchResult = event;
            }
          },
          continueFrom,
        );

        // TODO: we don't get the dispatchId from the RPC stream yet.
        // For now, session continuity works through the server-side
        // restore logic.
      } catch (err) {
        addMessage("system", `Error: ${err instanceof Error ? err.message : String(err)}`);
        setRunning(false);
      }
    },
    [client, addMessage, handleEvent],
  );

  const reset = useCallback(() => {
    sessionRef.current = {};
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

      const msgs = await client.getMessages(dispatchId);
      const chatMsgs: ChatMessage[] = [];
      for (const m of msgs) {
        if (m.role === "system") continue;
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
