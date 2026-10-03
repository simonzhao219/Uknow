import * as React from "react";
import { Slot } from "@radix-ui/react-slot@1.1.2";
import { cva, type VariantProps } from "class-variance-authority@0.7.1";

import { cn } from "./utils";

const badgeVariants = cva(
  // max-w-full + text-ellipsis：原本只有 w-fit + whitespace-nowrap + overflow-hidden，
  // 三者湊不出截斷——nowrap 讓 min-content 等於整串文字，w-fit 就縮不到父層以下，
  // 徽章會整個溢出容器（overflow-hidden 只裁自己的子元素，裁不到撐開自己的文字）。
  // 補上 max-w-full 讓寬度封頂在父層內容盒，text-overflow 才有作用點、長標籤
  // 以「…」收尾而不是跑出去。
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit max-w-full whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden text-ellipsis",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // S2 色彩收斂新增（D3）：實心（A 形狀）比照上面 destructive 的寫法。
        success:
          "border-transparent bg-success text-success-foreground [a&]:hover:bg-success/90",
        warning:
          "border-transparent bg-warning text-warning-foreground [a&]:hover:bg-warning/90",
        // 淺底（B 形狀）比照 token 的 *-subtle 三件組——全站多處手刻的
        // 淺底徽章（狀態 pill）改走這裡，不再各自拼 className。
        "success-subtle":
          "border-success-border bg-success-subtle text-success-subtle-foreground [a&]:hover:bg-success-subtle/90",
        "warning-subtle":
          "border-warning-border bg-warning-subtle text-warning-subtle-foreground [a&]:hover:bg-warning-subtle/90",
        "destructive-subtle":
          "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground [a&]:hover:bg-destructive-subtle/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp: any = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
