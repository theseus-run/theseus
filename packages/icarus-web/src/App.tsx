/**
 * App — root component wiring useChat to the UI.
 */

import { useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { Header } from "@/components/header";
import {
  ChatContainer,
  ChatContainerContent,
  ChatScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { Message } from "@/components/prompt-kit/message";
import { PromptInput } from "@/components/prompt-kit/prompt-input";

export default function App() {
  const { messages, connected, running, agent, iteration, sendMessage, reset } =
    useChat();
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen">
      <Header
        connected={connected}
        running={running}
        agent={agent}
        iteration={iteration}
        onReset={reset}
      />

      <ChatContainer className="flex-1 relative">
        <ChatContainerContent className="py-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full min-h-[200px] text-zinc-700 text-sm">
              type a message to begin
            </div>
          )}
          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}
          {running && (
            <div className="px-4 py-1.5 max-w-3xl mx-auto w-full">
              <div className="text-[11px] text-zinc-600 animate-pulse">
                ...
              </div>
            </div>
          )}
        </ChatContainerContent>
        <ChatScrollAnchor />
      </ChatContainer>

      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={!connected}
        placeholder={connected ? "Send a message..." : "Connecting..."}
      />
    </div>
  );
}
