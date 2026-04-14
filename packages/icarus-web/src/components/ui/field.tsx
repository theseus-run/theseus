import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("field rhythm", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("label-text block", className)} {...props} />;
}

export function FieldHint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("field-hint", className)}>{children}</p>;
}
