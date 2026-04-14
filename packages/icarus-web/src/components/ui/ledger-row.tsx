import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LedgerRow({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={cn("ledger-row", className)} {...props} />;
}

export function LedgerRowBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("ledger-row-body", className)}>{children}</div>;
}
