import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatusStrip({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("status-strip", className)} {...props} />;
}

export function StatusStripItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("status-strip-item", className)}>{children}</span>;
}
