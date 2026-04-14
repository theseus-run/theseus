import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "process" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  good: "tone-good",
  process: "tone-process",
  danger: "tone-danger",
  muted: "tone-muted",
};

export function Transcript({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("transcript", className)} {...props} />;
}

export function TranscriptRow({
  className,
  variant = "assistant",
  ...props
}: HTMLAttributes<HTMLElement> & {
  variant?: "user" | "assistant" | "runtime" | "system";
}) {
  return (
    <article className={cn("transcript-row", `transcript-row-${variant}`, className)} {...props} />
  );
}

export function TranscriptRowPrefix({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn("transcript-row-prefix", toneClass[tone], className)}>{children}</span>
  );
}

export function TranscriptRowBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("transcript-row-body", className)}>{children}</div>;
}

export function TranscriptRowMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("transcript-row-meta", className)}>{children}</div>;
}
