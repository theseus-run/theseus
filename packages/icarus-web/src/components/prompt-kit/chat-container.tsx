/**
 * ChatContainer — auto-scrolling chat wrapper using use-stick-to-bottom.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { cn } from "@/lib/utils";

interface ChatContainerContext {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
}

const Ctx = createContext<ChatContainerContext | null>(null);

export function useChatContainer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChatContainer must be used within ChatContainer");
  return ctx;
}

export function ChatContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } =
    useStickToBottom();

  return (
    <Ctx value={{ scrollRef, contentRef, isAtBottom, scrollToBottom }}>
      <div className={cn("flex flex-col h-full", className)}>{children}</div>
    </Ctx>
  );
}

export function ChatContainerContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { scrollRef, contentRef } = useChatContainer();

  return (
    <div
      ref={scrollRef}
      className={cn("flex-1 overflow-y-auto", className)}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

export function ChatScrollAnchor() {
  const { isAtBottom, scrollToBottom } = useChatContainer();

  if (isAtBottom) return null;

  return (
    <button
      type="button"
      onClick={scrollToBottom}
      className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/80 transition-colors"
    >
      Scroll to bottom
    </button>
  );
}
