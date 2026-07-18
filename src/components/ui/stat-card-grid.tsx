import * as React from "react";

import { cn } from "./utils";

// 桌面欄數 = 卡片數（靜態 class 讓 Tailwind JIT 能產生）。
const MD_COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

/**
 * 統計卡片列的共用佈局原語：欄數由卡片數量決定，永遠等寬填滿、左右對稱。
 *
 * 取代專案裡散落的「固定寬度 + 水平捲動」輪播寫法
 * （flex overflow-x-auto + min-w-[Npx] shrink-0）——那種寫法在卡片數量改變時
 * （例如某幾張被停用）會靠左並在右側留白、造成版面不對稱。
 *
 * 手機一律兩欄（2 張→一列、4 張→2×2 全部可見，不需水平捲動）；
 * 桌面欄數等於卡片數。用 React.Children 計數，因此新增/停用卡片時佈局會自動跟著調整。
 */
export function StatCardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const count = React.Children.toArray(children).length;
  const baseCols = count <= 1 ? "grid-cols-1" : "grid-cols-2";
  const mdCols = MD_COLS[Math.min(count, 4)] ?? "md:grid-cols-4";

  return (
    <div className={cn("grid gap-4", baseCols, mdCols, className)}>
      {children}
    </div>
  );
}
