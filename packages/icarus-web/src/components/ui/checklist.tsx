import type { HTMLAttributes, LiHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Checklist({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("checklist", className)} {...props} />;
}

export function ChecklistItem({
  children,
  className,
  ...props
}: LiHTMLAttributes<HTMLLIElement> & { children: ReactNode }) {
  return (
    <li className={cn("checklist-item", className)} {...props}>
      {children}
    </li>
  );
}
