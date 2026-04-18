/**
 * Message — chat message display component.
 */

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { ToolEvent } from "./tool-event";

export function Message({ message, className }: { message: ChatMessage; className?: string }) {
  switch (message.role) {
    case "user":
      return (
        <div className={cn("px-4 py-2 flex justify-end", className)}>
          <div className="bg-zinc-800 text-zinc-100 text-sm whitespace-pre-wrap rounded-2xl rounded-br-sm px-3 py-2 max-w-[75%]">
            {message.content}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div className={cn("px-4 py-2", className)}>
          <div className="markdown-body text-sm">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
        </div>
      );

    case "system":
      return (
        <div className={cn("px-4 py-1.5", className)}>
          <div className="text-xs text-yellow-500/80">{message.content}</div>
        </div>
      );

    case "event":
      if (message.event) {
        return <ToolEvent event={message.event} className={className} />;
      }
      return (
        <div className={cn("px-4 py-0.5", className)}>
          <div className="text-[11px] font-mono text-zinc-600 border-l-2 border-zinc-800 pl-2">
            {message.content}
          </div>
        </div>
      );
  }
}
