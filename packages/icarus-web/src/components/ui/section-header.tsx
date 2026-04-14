import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("section-header", className)} {...props} />;
}

export function SectionHeaderTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("section-header-title", className)}>{children}</div>;
}

export function SectionHeaderMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("section-header-meta", className)}>{children}</div>;
}
