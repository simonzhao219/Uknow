import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';

export interface CategoryBadgeProps {
  category: string;
  className?: string;
  variant?: 'default' | 'secondary';
}

/**
 * 服務類別徽章——首頁桌面卡片、首頁手機卡片、服務者詳情頁、刊登管理頁共用。
 *
 * 為什麼要有這個元件:自訂服務類別上線後,類別長度不再由開發者決定
 * (內建類別最長 6 字,自訂上限 10 字),而這四處原本各自貼 CSS、零機械驗證。
 * 收斂成一個元件之後,「有寬度界限」由建構保證,一支測試守四個地方。
 *
 * 界限由三件事湊成,缺一不可:
 *   - `max-w-full`——寬度封頂在父層內容盒,超不出容器
 *   - `truncate`——超出時單行截斷,不換行撐高卡片
 *   - `title`——截斷之後全文仍讀得到(hover / 輔助技術)
 *
 * **`max-w-full` 是預設,不是 `max-w-[45%]`。** 百分比上限只在「徽章與名稱
 * 同列競爭寬度」時才有意義(`Badge` 基底帶 `shrink-0`,flex 容器會先餵飽
 * 徽章再壓縮名稱),那兩處由呼叫端自己傳 `max-w-[45%]`。徽章獨佔一行的兩處
 * (首頁手機卡片、刊登管理頁)沒有競爭對象,套 45% 只會過度截斷:375px 下
 * 手機卡片單欄約 149px,45% 扣掉 `px-2` 內距後只剩約 50px,`text-xs` 下不到
 * 4 個全形字——連「寵物美容」都放不下,直接違背 10 字上限的設計前提。
 *
 * `cn()` 的順序刻意讓呼叫端的 className 在後:四處的字級與內距各不相同
 * (詳情頁 `text-lg`、手機卡片 `text-xs`),tailwind-merge 只合併**同一族**
 * 的類別,所以呼叫端調字級不會把 `truncate` 洗掉,而傳 `max-w-*` 則會
 * ——那正是同列兩處要的覆寫。
 */
export function CategoryBadge({ category, className, variant = 'secondary' }: CategoryBadgeProps) {
  return (
    <Badge variant={variant} className={cn('max-w-full truncate', className)} title={category}>
      {category}
    </Badge>
  );
}
