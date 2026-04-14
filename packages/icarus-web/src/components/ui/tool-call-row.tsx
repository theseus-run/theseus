import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "process" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  good: "tone-good",
  process: "tone-process",
  danger: "tone-danger",
  muted: "tone-muted",
};

export function ToolCallRow({
  className,
  tone = "muted",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button type="button" className={cn("tool-call-row", toneClass[tone], className)} {...props} />
  );
}

export function ToolCallRowPrefix({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("tool-call-row-prefix", className)}>{children}</span>;
}

export function ToolCallRowBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("tool-call-row-body", className)}>{children}</div>;
}

export function ToolCallRowMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("tool-call-row-meta", className)}>{children}</div>;
}
