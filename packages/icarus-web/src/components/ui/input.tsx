import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return <input className={cn("input", className)} {...props} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn("input min-h-[calc(var(--lh)*6)]", className)} {...props} />;
}

export function InlinePrompt({ className, ...props }: TextareaProps) {
  return (
    <div className="input-shell flex items-start gap-[1ch]">
      <span className="shrink-0 text-muted-foreground">&gt;</span>
      <textarea
        className={cn(
          "min-h-[var(--lh)] flex-1 resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
          className,
        )}
        rows={1}
        {...props}
      />
    </div>
  );
}
