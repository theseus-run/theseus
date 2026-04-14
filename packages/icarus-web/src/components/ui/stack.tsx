import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type StackGap = "xs" | "sm" | "md" | "lg";
type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
type StackJustify = "start" | "center" | "end" | "between";

const gapValue: Record<StackGap, string> = {
  xs: "calc(var(--lh) / 4)",
  sm: "calc(var(--lh) / 2)",
  md: "var(--lh)",
  lg: "calc(var(--lh) * 1.5)",
};

const alignClass: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const justifyClass: Record<StackJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

export function XStack({
  className,
  gap = "sm",
  align = "center",
  justify = "start",
  wrap = false,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  gap?: StackGap;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex",
        alignClass[align],
        justifyClass[justify],
        wrap && "flex-wrap",
        className,
      )}
      style={{ gap: gapValue[gap], ...style }}
      {...props}
    />
  );
}

export function YStack({
  className,
  gap = "sm",
  align = "stretch",
  justify = "start",
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  gap?: StackGap;
  align?: Exclude<StackAlign, "baseline">;
  justify?: StackJustify;
}) {
  return (
    <div
      className={cn("flex flex-col", alignClass[align], justifyClass[justify], className)}
      style={{ gap: gapValue[gap], ...style }}
      {...props}
    />
  );
}
