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
 *   - `max-w-[45%]`——`Badge` 基底帶 `shrink-0`,flex 容器會先餵飽徽章
 *     再壓縮旁邊的名稱;沒有上限時長類別會把名稱擠到 0 寬
 *   - `truncate`——超出時單行截斷,不換行撐高卡片
 *   - `title`——截斷之後全文仍讀得到(hover / 輔助技術)
 *
 * `cn()` 的順序刻意讓呼叫端的 className 在後:四處的字級與內距各不相同
 * (詳情頁 `text-lg`、手機卡片 `text-xs`),但 tailwind-merge 只會合併
 * **同一族**的類別,所以呼叫端調字級不會把 `max-w`/`truncate` 洗掉。
 */
export function CategoryBadge({ category, className, variant = 'secondary' }: CategoryBadgeProps) {
  return (
    <Badge variant={variant} className={cn('max-w-[45%] truncate', className)} title={category}>
      {category}
    </Badge>
  );
}
