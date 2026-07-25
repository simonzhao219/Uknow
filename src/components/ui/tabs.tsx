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
        "data-[state=active]:bg-card dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-auto items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
