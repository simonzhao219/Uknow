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
  /**
   * title 要渲染的標籤，預設 `p`。取代手刻提示框時，原本若是真標題
   * （`h2`～`h4`）要傳對應層級，否則螢幕閱讀器的「依標題導覽」會少一個
   * 節點（review 抓到的發現：早期版本恆用 `p`，吃掉了幾處頁面唯一的
   * 主標題）。
   */
  titleAs?: React.ElementType;
  description?: React.ReactNode;
  /**
   * 互動元素（按鈕、連結列表）——獨立於 description 之外，不套用
   * description 的 `opacity-90`。這個框到處要求 4.5:1 對比，可點擊
   * 的控制項不該被文字說明用的透明度包住（review 抓到的發現：早期
   * 版本沒有這個 slot，各消費端各自把按鈕塞進 description，造成
   * 互動元素透明度不一致且未經對比驗證）。
   */
  action?: React.ReactNode;
}

function StatusCallout({
  variant,
  icon: Icon,
  title,
  titleAs: TitleTag = "p",
  description,
  action,
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
      <div className="space-y-1 min-w-0 flex-1">
        <TitleTag className="font-medium">{title}</TitleTag>
        {description && <div className="text-sm opacity-90">{description}</div>}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}

export { StatusCallout, statusCalloutVariants };
