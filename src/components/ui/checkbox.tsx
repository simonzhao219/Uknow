"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox@1.1.4";
import { CheckIcon } from "lucide-react@0.487.0";

import { cn } from "./utils";

// 觸控目標:**opt-in**,預設渲染一個位元組都不變。
//
// 為什麼不像 button.tsx:27-30 那樣直接放大可見尺寸:button/input/select 放大
// 的是本來就有版面高度的控制項(`min-h-[44px]`,視覺變化小);checkbox 的可見
// 方框是 16px 的**符號**,放到 44px 是明顯的外觀變更,而它被 5 個**不在
// RWD 範圍內**的會員端頁面共用(WithdrawalProcess / JoinReferralProgramDialog
// / CompleteProfile / CreateServiceProvider / EditServiceProvider)。
//
// 為什麼不改預設值再「靠視覺不變」豁免回歸驗證:那個論證只證明了看起來沒事,
// 沒證明**點起來**沒事。CreateServiceProvider.tsx:413 的服務區域選擇器是
// `grid grid-cols-2 gap-2`,列高 ~20px + gap 8px = 相鄰列中心距約 28px;44px
// 熱區上下各延伸 22px,**重疊 16px**。使用者想勾第 5 區、手指落在交界帶會勾到
// 第 4 或第 6 區,沒有任何錯誤訊息,而它寫進的是 districts——決定這個服務者在
// 哪些地區被搜尋到。降低 inset 也救不了:28px 列距下不重疊的上限是每邊 6px,
// 熱區只有 28px,達不到 44px。所以只有 admin 的提領勾選 opt-in。
//
// ⚠️ `before:content-['']` 缺不得。CSS 規範下 `::before` 的 content 初始值是
// `normal`(計算值等同 none),不生成渲染盒,absolute 與 inset 全部無效。
// 本專案 Tailwind v4 的 preflight 只重置 box-sizing/margin/padding/border,
// **不設 content**(v3 的 preflight 有 --tw-content,v4 拿掉了)。漏掉它整個
// 熱區是完全無聲的 no-op——由 e2e/test_admin_mobile_layout.py 的點擊命中測試
// 把關(量盒子量不到偽元素,那是量錯東西)。
// z-10 不是裝飾:熱區靠負 inset 伸進相鄰儲存格,而同層的兄弟元素繪製在後,
// 在重疊帶會贏走命中——實測沒有 z-10 時可點區只到 37x41px(名目 44 被鄰居
// 切掉)。提升層級後熱區才真的可用。它只在 pointer-coarse 生效,滑鼠裝置的
// 堆疊順序完全不變。
const EXPANDED_TOUCH_TARGET =
  "pointer-coarse:relative pointer-coarse:z-10 pointer-coarse:before:content-[''] " +
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-[15px]";
// 15 不是 14:`inset` 的參考是**padding box**,而 size-4 帶 1px 邊框,padding box
// 只有 14px。-14px 會做出 42x42(實測),-15px 才是 14+30=44。

type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
  /** `expanded`:觸控裝置上把**可點區**撐到 44x44,可見方框維持 16px。 */
  touchTarget?: "default" | "expanded";
};

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, touchTarget = "default", ...props }, ref) => {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      className={cn(
        "peer border bg-input-background dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        touchTarget === "expanded" && EXPANDED_TOUCH_TARGET,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
    );
  },
);

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
