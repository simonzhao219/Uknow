"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "./utils";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // max-h + overflow-y-auto：面板的高度不一定由開發者決定（首頁「服務類別」
          // 的 chip 數量＝內建 30 類 + 全站共享的自訂類別，數量無上限）。
          // PopoverContent 是 portal + fixed，長過視窗又沒有捲軸時底部內容
          // 永久點不到——那不是視覺瑕疵，是功能不可及。available-height 是
          // Radix 依觸發器到視窗邊緣算出的實際空間，比任何寫死的 vh 都準；
          // select.tsx 早就用同一條，這裡補上之後兩個浮層原語的界限對齊，
          // 呼叫端不必再各自記得補。
          "max-h-(--radix-popover-content-available-height) overflow-y-auto",
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 rounded-lg border p-4 shadow-md outline-hidden",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
