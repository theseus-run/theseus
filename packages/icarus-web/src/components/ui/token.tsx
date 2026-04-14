import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "good" | "process" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  good: "tone-good",
  process: "tone-process",
  danger: "tone-danger",
  muted: "tone-muted",
};

export function Token({
  children,
  label,
  value,
  tone = "muted",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  label?: ReactNode;
  value?: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={cn("token", toneClass[tone], className)} {...props}>
      {label !== undefined || value !== undefined ? (
        <>
          {label !== undefined ? <span className="token-key">{label}</span> : null}
          {label !== undefined && value !== undefined ? <span className="token-sep">:</span> : null}
          {value !== undefined ? <span className="token-value">{value}</span> : null}
        </>
      ) : (
        children
      )}
    </span>
  );
}
