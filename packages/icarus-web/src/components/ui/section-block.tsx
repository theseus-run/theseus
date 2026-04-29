import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionBlock({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("section-block", className)} {...props} />;
}

export function SectionBlockHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("section-block-header", className)} {...props} />;
}

export function SectionBlockTitle({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <h2 className={cn("eyebrow", className)}>{children}</h2>;
}

export function SectionBlockAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("section-block-action", className)} {...props} />;
}

export function SectionBlockBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("section-block-body", className)} {...props} />;
}
