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
  variant = "framed",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  label?: ReactNode;
  value?: ReactNode;
  tone?: Tone;
  variant?: "framed" | "plain";
}) {
  const content =
    label !== undefined || value !== undefined ? (
      <>
        {label !== undefined ? <span className="token-key">{label}</span> : null}
        {label !== undefined && value !== undefined ? <span className="token-sep">:</span> : null}
        {value !== undefined ? <span className="token-value">{value}</span> : null}
      </>
    ) : (
      children
    );

  return (
    <span className={cn("token", `token-${variant}`, toneClass[tone], className)} {...props}>
      {variant === "plain" ? (
        <>
          <span className="token-bracket" aria-hidden="true">
            [
          </span>
          {content}
          <span className="token-bracket" aria-hidden="true">
            ]
          </span>
        </>
      ) : (
        content
      )}
    </span>
  );
}
