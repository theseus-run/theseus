/**
 * App — root component with dispatch list + chat views.
 */

import { useMemo, useState } from "react";
import { DispatchList } from "@/components/dispatch-list";
import { Header } from "@/components/header";
import {
  ChatContainer,
  ChatContainerContent,
  ChatScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { Message } from "@/components/prompt-kit/message";
import { PromptInput } from "@/components/prompt-kit/prompt-input";
import type { ChatMessage } from "@/hooks/use-chat";
import { useChat } from "@/hooks/use-chat";
import { useDispatches } from "@/hooks/use-dispatches";
import { useTheseusClient } from "@/hooks/use-theseus-client";
import type { DispatchEvent } from "@/lib/rpc-client";

// ---------------------------------------------------------------------------
// Merge ToolCalling + ToolResult/ToolError into a single display message.
// Pure display transform — hook is untouched.
// ---------------------------------------------------------------------------

export type MergedEvent = DispatchEvent & {
  resultEvent?: DispatchEvent; // ToolResult or ToolError folded in
};

type DisplayMessage = Omit<ChatMessage, "event"> & { event?: MergedEvent };

function mergeToolEvents(messages: ChatMessage[]): DisplayMessage[] {
  const out: DisplayMessage[] = [];
  // Index of last unmatched ToolCalling per tool name
  const pending = new Map<string, number>(); // toolName → index in out[]

  for (const msg of messages) {
    const tag = msg.event?._tag;

    if (tag === "ToolCalling" && msg.event?.tool) {
      const idx = out.length;
      pending.set(msg.event.tool, idx);
      out.push({ ...msg, event: { ...msg.event } });
      continue;
    }

    if ((tag === "ToolResult" || tag === "ToolError") && msg.event?.tool) {
      const callingIdx = pending.get(msg.event.tool);
      if (callingIdx !== undefined) {
        // Fold result into the calling card
        const calling = out[callingIdx];
        if (calling === undefined) continue;
        out[callingIdx] = {
          ...calling,
          event: { ...(calling.event as MergedEvent), resultEvent: msg.event },
        };
        pending.delete(msg.event.tool);
        continue; // Don't add as separate message
      }
    }

    out.push(msg as DisplayMessage);
  }

  return out;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type View = { kind: "list" } | { kind: "chat" };

export default function App() {
  const { client, connected } = useTheseusClient();
  const { messages, running, agent, iteration, sendMessage, reset, loadDispatch } = useChat(client);
  const { dispatches, loading, refresh } = useDispatches(client);
  const [view, setView] = useState<View>({ kind: "list" });
  const [input, setInput] = useState("");

  const displayMessages = useMemo(() => mergeToolEvents(messages), [messages]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
    // Switch to chat view on first message
    if (view.kind === "list") setView({ kind: "chat" });
  };

  const handleNew = () => {
    reset();
    setView({ kind: "chat" });
  };

  const handleBack = () => {
    refresh();
    setView({ kind: "list" });
  };

  const handleSelectDispatch = (dispatchId: string) => {
    loadDispatch(dispatchId);
    setView({ kind: "chat" });
  };

  if (view.kind === "list") {
    return (
      <div className="flex flex-col h-screen">
        <Header
          connected={connected}
          running={running}
          agent={agent}
          iteration={iteration}
          onReset={handleNew}
          onBack={undefined}
        />
        <div className="flex-1 overflow-hidden">
          <DispatchList
            dispatches={dispatches}
            loading={loading}
            onSelect={handleSelectDispatch}
            onNew={handleNew}
          />
        </div>
        <PromptInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={!connected}
          placeholder={connected ? "describe a task..." : "connecting..."}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        connected={connected}
        running={running}
        agent={agent}
        iteration={iteration}
        onReset={handleNew}
        onBack={handleBack}
      />

      <ChatContainer className="flex-1 relative">
        <ChatContainerContent className="py-4">
          <div className="max-w-3xl mx-auto w-full">
            {displayMessages.length === 0 && (
              <div className="flex items-center justify-center min-h-[200px] text-zinc-700 text-sm">
                type a message to begin
              </div>
            )}
            {displayMessages.map((msg) => (
              <Message key={msg.id} message={msg as ChatMessage} />
            ))}
            {running && (
              <div className="px-4 py-2">
                <div className="flex items-center gap-1 text-zinc-600 font-mono text-sm">
                  <span>&gt;</span>
                  <span
                    className="inline-block w-2 h-3.5 bg-zinc-600"
                    style={{ animation: "blink 1s step-end infinite" }}
                  />
                </div>
              </div>
            )}
          </div>
        </ChatContainerContent>
        <ChatScrollAnchor />
      </ChatContainer>

      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={!connected}
        placeholder={connected ? "send a message..." : "connecting..."}
      />
    </div>
  );
}
