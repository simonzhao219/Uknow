"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs@1.1.3";

import { cn } from "./utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // overflow-x-auto：分頁數量或標籤長度超出可用寬度時（中文標籤在手機上
        // 很容易），改成橫向捲動。原本沒有這道退路，標籤只能互相擠壓到文字重疊
        // ——導覽標籤被截斷或疊字就失去導覽功能，捲動是唯一不損失資訊的降級。
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-xl p-[3px] flex overflow-x-auto",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // flex-auto（flex: 1 1 auto）而非 flex-1（flex: 1 1 0%）：兩者都會等比
        // 撐滿多餘空間，但 flex-1 的 basis 0% 讓分頁可以被壓到比自己的文字還窄，
        // 配上 whitespace-nowrap 就是文字滿出格子、與隔壁疊在一起。flex-auto 的
        // basis auto 使 min-content（＝整串不可斷的標籤）成為寬度下限，擠不下時
        // 由 TabsList 的 overflow-x-auto 接手捲動。
        // 選中分頁＝無框元件的選取態（§12.12）：底色 --sel（灰字）、文字反白，不靠字色或
        // 粗體——選中與否在色盲下仍是「實心 vs 透明」的明度差。只換顏色、不改盒模型，
        // admin 分頁列的量測法（AdminDashboard.tsx 註解）不受影響。dark 變體要保留：
        // specificity 才贏得過 dark:text-muted-foreground。焦點只有鍵盤焦點環。
        "data-[state=active]:bg-sel data-[state=active]:text-sel-foreground dark:data-[state=active]:text-sel-foreground focus-visible:ring-ring text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-auto items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-hidden focus-visible:ring-[3px] focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
