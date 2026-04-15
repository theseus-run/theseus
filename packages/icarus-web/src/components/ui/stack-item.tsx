import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function StackItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("stack-item", className)} {...props} />;
}
