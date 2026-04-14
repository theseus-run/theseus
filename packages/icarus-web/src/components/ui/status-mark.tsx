import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "process" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  good: "tone-good",
  process: "tone-process",
  danger: "tone-danger",
  muted: "tone-muted",
};

export function StatusMark({
  symbol,
  tone = "muted",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  symbol: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={cn("status-mark", className)} {...props}>
      <span className={cn("status-mark-symbol", toneClass[tone])} aria-hidden="true">
        {symbol}
      </span>
      <span>{children}</span>
    </span>
  );
}
