import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { StatBlock, StatBlockLabel, StatBlockValue } from "./stat-block";

type Tone = "good" | "process" | "danger" | "muted";

export function StatGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("stat-grid", className)} {...props} />;
}

export function StatCell({
  label,
  value,
  tone = "muted",
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: Tone;
}) {
  return (
    <StatBlock tone={tone}>
      <StatBlockLabel>{label}</StatBlockLabel>
      <StatBlockValue>{value}</StatBlockValue>
    </StatBlock>
  );
}
