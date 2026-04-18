/**
 * PromptInput — auto-resizing textarea with submit on Enter.
 */

import { type KeyboardEvent, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = "...",
  disabled = false,
  className,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim()) onSubmit();
      }
    },
    [value, onSubmit],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  return (
    <div className={cn("border-t border-zinc-800 bg-zinc-950 px-4 py-3", className)}>
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <span className="text-zinc-600 text-sm py-1.5 select-none">&gt;</span>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none disabled:opacity-40 py-1.5"
        />
      </div>
    </div>
  );
}
