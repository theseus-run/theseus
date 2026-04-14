import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "process" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  good: "tone-good",
  process: "tone-process",
  danger: "tone-danger",
  muted: "tone-muted",
};

export function SignalRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("signal-row", className)} {...props} />;
}

export function SignalRowSymbol({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn("signal-row-symbol", toneClass[tone], className)}>{children}</span>;
}

export function SignalRowLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("strong-text", className)}>{children}</span>;
}

export function SignalRowValue({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("text-muted-foreground", className)}>{children}</span>;
}
