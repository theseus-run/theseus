import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TitleBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("title-block", className)} {...props} />;
}

export function TitleBlockEyebrow({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

export function TitleBlockTitle({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <h1 className={cn("heading-1", className)}>{children}</h1>;
}

export function TitleBlockSubtitle({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <p className={cn("lede", className)}>{children}</p>;
}

export function TitleBlockMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("title-block-meta", className)} {...props} />;
}
