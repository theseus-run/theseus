import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      default: "",
      danger: "btn-danger",
      confirm: "btn-confirm",
      ghost: "border-transparent hover:border-border",
    },
    size: {
      default: "",
      sm: "h-[calc(var(--lh)*1.75)] px-[0.75ch]",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
