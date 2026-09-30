import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border border-transparent px-[9px] py-[3px] text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-brand-50 text-brand-700",
        secondary: "bg-secondary text-text-3",
        outline: "border-border bg-card text-muted-foreground",
        success: "bg-[#ecfdf3] text-[#067647]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
