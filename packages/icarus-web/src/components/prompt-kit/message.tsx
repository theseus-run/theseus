/**
 * Message — chat message display component.
 */

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/hooks/use-chat";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Message({
  message,
  className,
}: {
  message: ChatMessage;
  className?: string;
}) {
  switch (message.role) {
    case "user":
      return (
        <div className={cn("px-4 py-2 max-w-3xl mx-auto w-full", className)}>
          <div className="text-[11px] text-zinc-500 mb-1">you</div>
          <div className="text-sm text-zinc-100 whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div className={cn("px-4 py-2 max-w-3xl mx-auto w-full", className)}>
          <div className="text-[11px] text-zinc-500 mb-1">assistant</div>
          <div className="markdown-body text-sm">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
        </div>
      );

    case "system":
      return (
        <div className={cn("px-4 py-1.5 max-w-3xl mx-auto w-full", className)}>
          <div className="text-xs text-yellow-500/80">
            {message.content}
          </div>
        </div>
      );

    case "event":
      return (
        <div className={cn("px-4 py-0.5 max-w-3xl mx-auto w-full", className)}>
          <div className="text-[11px] text-zinc-600 border-l-2 border-zinc-800 pl-2">
            {message.content}
          </div>
        </div>
      );
  }
}
