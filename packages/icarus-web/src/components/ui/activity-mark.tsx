import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "process" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  good: "tone-good",
  process: "tone-process",
  danger: "tone-danger",
  muted: "tone-muted",
};

export function ActivityMark({
  children,
  tone = "process",
  active = true,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  readonly children: ReactNode;
  readonly tone?: Tone;
  readonly active?: boolean;
}) {
  return (
    <span className={cn("activity-mark", active && "activity-mark-active", className)} {...props}>
      <span className={cn("activity-mark-symbol", toneClass[tone])} aria-hidden="true">
        *
      </span>
      <span>{children}</span>
    </span>
  );
}
