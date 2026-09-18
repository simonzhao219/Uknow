import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority@0.7.1";
import type { LucideIcon } from "lucide-react";

import { cn } from "./utils";

// S2 色彩收斂新增（D3，plan.md §2.4/§3 D3）：全站至少 20+ 處手刻的「淺底提示框」
// （bg+border+text 三件式的整塊說明框，形狀 B）結構高度重複，元件化一次。
// variant 對照 globals.css 的語義色 token，neutral 給非狀態的一般說明用。
const statusCalloutVariants = cva("rounded-lg border p-4 flex gap-3 items-start", {
  variants: {
    variant: {
      success: "bg-success-subtle border-success-border text-success-subtle-foreground",
      warning: "bg-warning-subtle border-warning-border text-warning-subtle-foreground",
      destructive:
        "bg-destructive-subtle border-destructive-border text-destructive-subtle-foreground",
      neutral: "bg-muted border-border text-foreground",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
});

interface StatusCalloutProps
  extends Omit<React.ComponentProps<"div">, "title">,
    VariantProps<typeof statusCalloutVariants> {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
}

function StatusCallout({
  variant,
  icon: Icon,
  title,
  description,
  className,
  ...props
}: StatusCalloutProps) {
  return (
    <div
      data-slot="status-callout"
      role="status"
      className={cn(statusCalloutVariants({ variant }), className)}
      {...props}
    >
      {Icon && <Icon className="size-5 shrink-0 mt-0.5" aria-hidden="true" />}
      <div className="space-y-1 min-w-0">
        <p className="font-medium">{title}</p>
        {description && <div className="text-sm opacity-90">{description}</div>}
      </div>
    </div>
  );
}

export { StatusCallout, statusCalloutVariants };
