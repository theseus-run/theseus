import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "process" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  good: "tone-good",
  process: "tone-process",
  danger: "tone-danger",
  muted: "tone-muted",
};

export function StatBlock({
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div className={cn("stat-block", toneClass[tone], className)} {...props} />;
}

export function StatBlockLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("label-text", className)}>{children}</span>;
}

export function StatBlockValue({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("stat-block-value", className)}>{children}</p>;
}
