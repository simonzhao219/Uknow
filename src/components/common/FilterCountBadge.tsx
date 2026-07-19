import { Badge } from "../ui/badge";
import { cn } from "../ui/utils";

// 篩選數量徽章（單一事實來源）。
//
// 收斂原本散在「性別 / 服務類別 / 服務地區」三個手機篩選鈕、各自手寫的
//   <Badge variant="secondary" className="text-xs px-1 py-0">{n}</Badge>
// 為單一元件，順便修掉脆弱的樣式：
//   - 原本 `py-0`（零垂直內距）+ Badge 基底的 `overflow-hidden`，是靠 text-xs 的
//     預設行高（1rem）才剛好沒把數字裁掉；一旦遇到不同字體、動態字級（iOS Dynamic
//     Type）或雙位數，就有貼邊被裁的風險——與先前性別 Badge 破版是同一類問題。
//   - 這裡改用 `leading-none` 讓行框等於字高、由對稱內距決定留白，並加 `tabular-nums`
//     與 `min-w-4 text-center` 讓一位／兩位數都置中對齊、不會忽寬忽窄。
// 保留 `overflow-hidden`（Badge 基底用它維持圓角裁切），因為內容已能穩定塞進。

/**
 * 是否要顯示數量徽章：僅在數量為有限且大於 0 時顯示。
 * 抽成純函式以便單元測試，同時讓呼叫端可直接把原始數量丟進來、免自行判斷 0 的情況。
 */
export function shouldRenderCountBadge(count: number): boolean {
  return Number.isFinite(count) && count > 0;
}

interface FilterCountBadgeProps {
  /** 已選篩選條件的數量；<= 0（或非有限數）時不渲染 */
  count: number;
  className?: string;
}

export function FilterCountBadge({ count, className }: FilterCountBadgeProps) {
  if (!shouldRenderCountBadge(count)) return null;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "min-w-4 px-1 py-0 text-xs leading-none tabular-nums",
        className,
      )}
      aria-label={`已選 ${count} 項`}
    >
      {count}
    </Badge>
  );
}
