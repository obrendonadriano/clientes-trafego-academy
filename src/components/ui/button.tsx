import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] text-sm font-medium transition-all duration-200 active:scale-[0.985] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(180deg,var(--brand-500),var(--brand-600))] font-semibold text-primary-foreground shadow-[0_1px_2px_rgba(16,24,40,0.1),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_8px_20px_-8px_rgba(106,69,232,0.6)] hover:brightness-[1.07]",
        outline:
          "border border-border bg-card text-text-2 hover:bg-surface-2",
        secondary:
          "border border-brand-200 bg-brand-50 font-semibold text-brand-700 hover:bg-brand-100",
      },
      size: {
        default: "h-10 px-4",
        lg: "h-12 rounded-xl px-5 text-[15px]",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
