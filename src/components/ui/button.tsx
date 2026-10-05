import * as React from "react";
import { Slot } from "@radix-ui/react-slot@1.1.2";
import { cva, type VariantProps } from "class-variance-authority@0.7.1";
import { Loader2 } from "lucide-react@0.487.0";

import { cn } from "./utils";

// 次要動作的外觀（白底、邊框色框線、墨字）。variant="outline" 與 tone="secondary"
// 共用這一串，兩種寫法畫出來一模一樣；新程式碼用 tone（ui-ux-guidelines §12.11）。
// 底色用 bg-card 而非 bg-background：版面底若改淡灰，外框鈕仍要是白的。
const SECONDARY_SURFACE =
  "border bg-card text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50";

// 有色容器裡的次要鈕：白底，框線與字取容器的 300／800 層。
const CONTAINER_SECONDARY = "border bg-card";

const buttonVariants = cva(
  // 焦點只有鍵盤淡環（focus-visible 的 3px ring-ring，§12.12），不再同時改框線色——
  // 選取與聚焦一個訊號，不疊加。
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive-border",
  {
    variants: {
      // 結構形狀。default 形狀的顏色交給 tone × container（見 compoundVariants）。
      variant: {
        default: "",
        // 紅實心：只給不可逆的確認框，以及疊在照片上的移除鈕（外框在圖上看不見）。
        // 一般破壞性動作用 tone="destructive"（紅框字），§12.11。
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: SECONDARY_SURFACE,
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        // 連結＝墨色加常駐底線：顏色與內文相同，底線是唯一的區分（§12.3）。
        link: "text-primary underline underline-offset-4",
      },
      // 按鈕三分法（§12.11）：flow＝流程主要動作（不做就中斷，墨黑實心）；guide＝主動引導
      // （品牌色實心，只給續訂＞加入推薦計畫＞確認收款，一頁一顆）；secondary＝次要
      // （白底框線）；destructive＝破壞性（紅框字）。只在 variant="default" 上生效。
      tone: {
        flow: "",
        guide: "",
        secondary: "",
        destructive: "",
      },
      // 按鈕所在的容器。實心鈕（flow／guide）在有色容器裡取容器的實心色，次要鈕取容器的
      // 框線與字；不傳＝黑白卡片（neutral）。
      container: {
        neutral: "",
        brand: "",
        warning: "",
        success: "",
        destructive: "",
      },
      // pointer-coarse:* 讓觸控裝置的點擊目標達 44px（Apple HIG / Material 建議），
      // 滑鼠（fine pointer）維持原本精簡尺寸，不影響桌機密度。
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 pointer-coarse:min-h-[44px]",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:min-h-[44px]",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4 pointer-coarse:min-h-[44px]",
        icon: "size-9 rounded-md pointer-coarse:size-[44px]",
      },
    },
    // 顏色只由這張表決定，不靠 tailwind-merge 去蓋 variant 的底色：
    // buttonVariants({ tone: 'guide' }) 的字串裡根本不會出現 bg-primary。
    compoundVariants: [
      {
        variant: "default",
        tone: "flow",
        container: "neutral",
        class: "bg-primary text-primary-foreground hover:bg-primary/90",
      },
      {
        variant: "default",
        tone: "guide",
        container: "neutral",
        class: "bg-brand text-brand-foreground hover:bg-brand/90",
      },
      {
        variant: "default",
        tone: ["flow", "guide"],
        container: "brand",
        class: "bg-brand text-brand-foreground hover:bg-brand/90",
      },
      {
        variant: "default",
        tone: ["flow", "guide"],
        container: "warning",
        class: "bg-warning text-warning-foreground hover:bg-warning/90",
      },
      {
        variant: "default",
        tone: ["flow", "guide"],
        container: "success",
        class: "bg-success text-success-foreground hover:bg-success/90",
      },
      {
        variant: "default",
        tone: ["flow", "guide"],
        container: "destructive",
        class: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      {
        variant: "default",
        tone: "secondary",
        container: "neutral",
        class: SECONDARY_SURFACE,
      },
      {
        variant: "default",
        tone: "secondary",
        container: "brand",
        class: `${CONTAINER_SECONDARY} border-brand text-brand-subtle-foreground hover:bg-brand-subtle`,
      },
      {
        variant: "default",
        tone: "secondary",
        container: "warning",
        class: `${CONTAINER_SECONDARY} border-warning-border text-warning-subtle-foreground hover:bg-warning-subtle`,
      },
      {
        variant: "default",
        tone: "secondary",
        container: "success",
        class: `${CONTAINER_SECONDARY} border-success-border text-success-subtle-foreground hover:bg-success-subtle`,
      },
      {
        variant: "default",
        tone: "secondary",
        container: "destructive",
        class: `${CONTAINER_SECONDARY} border-destructive-border text-destructive-subtle-foreground hover:bg-destructive-subtle`,
      },
      // 破壞性一律紅框字，不分容器。
      {
        variant: "default",
        tone: "destructive",
        class: `${CONTAINER_SECONDARY} border-destructive-border text-destructive-subtle-foreground hover:bg-destructive-subtle`,
      },
    ],
    defaultVariants: {
      variant: "default",
      tone: "flow",
      container: "neutral",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
      loading?: boolean;
    }
>(
  (
    {
      className,
      variant,
      tone,
      container,
      size,
      asChild = false,
      loading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, tone, container, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          // Slot requires a single React element child — never inject a sibling spinner.
          children
        ) : (
          <>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
