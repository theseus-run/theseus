import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Sheet({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null;

  return <div className="sheet-root">{children}</div>;
}

export function SheetOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sheet-overlay", className)} {...props} />;
}

export function SheetContent({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("sheet-content", className)} {...props} />;
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sheet-header", className)} {...props} />;
}

export function SheetTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("heading-2", className)}>{children}</h2>;
}

export function SheetMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sheet-meta", className)}>{children}</div>;
}

export function SheetBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sheet-body rhythm", className)} {...props} />;
}

export function SheetSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("sheet-section", className)} {...props} />;
}
