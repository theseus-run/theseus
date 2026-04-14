import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function QueueItem({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn("queue-item", className)} {...props} />;
}

export function QueueItemHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("queue-item-header", className)}>{children}</div>;
}

export function QueueItemTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("queue-item-title", className)}>{children}</p>;
}

export function QueueItemSummary({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("queue-item-summary", className)}>{children}</p>;
}

export function QueueItemMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("queue-item-meta", className)}>{children}</div>;
}
