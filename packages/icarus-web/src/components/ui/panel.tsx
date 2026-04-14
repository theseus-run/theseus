import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("panel", className)} {...props} />;
}

export function PanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-header", className)} {...props} />;
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-body rhythm", className)} {...props} />;
}

export function PanelTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("eyebrow", className)}>{children}</h2>;
}
