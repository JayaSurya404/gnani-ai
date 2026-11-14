import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[#7065E8]/10 text-[#5347C8] ring-[#7065E8]/20",
        secondary:
          "bg-slate-100 text-slate-700 ring-slate-200",
        destructive:
          "bg-rose-50 text-rose-700 ring-rose-200",
        outline:
          "text-slate-600 ring-slate-300 bg-white/60",
        success:
          "bg-emerald-50 text-emerald-700 ring-emerald-200",
        warning:
          "bg-amber-50 text-amber-800 ring-amber-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
