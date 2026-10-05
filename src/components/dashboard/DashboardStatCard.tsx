import type React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Card } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { buttonVariants } from '../ui/button';
import { cn } from '../ui/utils';

interface DashboardStatCardProps {
  to: string;
  title: string;
  icon: LucideIcon;
  /**
   * 整張卡是一個連結，aria-label 會取代內容成為唯一的可及名稱——必須把卡上
   * 看得到的狀態都說完（標題開頭，符合 WCAG 2.5.3 名稱含可見標籤）。
   */
  ariaLabel: string;
  loading?: boolean;
  children: React.ReactNode;
}

/**
 * 會員中心的狀態卡外殼（ui-ux-guidelines §13）：整張卡可點、右側 chevron，
 * 不另放重複標題的按鈕。卡內若要呈現「現在就能做的事」，用 StatCardAction 畫成
 * 按鈕樣式的 span——卡本身已是 <a>，裡面不能再巢狀一個連結。
 */
export function DashboardStatCard({
  to,
  title,
  icon: Icon,
  ariaLabel,
  loading,
  children,
}: DashboardStatCardProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className="group block min-w-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <Card className="h-full gap-2 p-4 transition-shadow group-hover:shadow-md">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{title}</span>
          <ChevronRight className="ml-auto size-4 shrink-0" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1.5">
          {loading ? (
            // 骨架占位，不先閃「0」再跳成真值（§5）。
            <>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            children
          )}
        </div>
      </Card>
    </Link>
  );
}

/** 單卡讀取失敗時的中性錯誤態——不上紅色、不整頁報錯，點卡片進完整頁面可重試。 */
export function StatCardError({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/**
 * 卡內的行動提示：點擊落在整張卡的連結上（目的地相同）。申請提領、立即刊登都是
 * 流程的起點，按鈕三分法歸次要（白底框線，ui-ux-guidelines §12.11）——進了流程才有
 * 墨黑的流程鈕；會員中心沒有要引導的事，所以卡片區沒有實心鈕。
 */
export function StatCardAction({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-testid="stat-card-action"
      className={cn(buttonVariants({ tone: 'secondary', size: 'sm' }), 'mt-1 w-full')}
    >
      {children}
    </span>
  );
}

/**
 * 卡片的主數字（§13 第 1 條：字級明顯大於其他）。手機 2×2 每張卡內寬只有約
 * 130px，六位數點數在 text-3xl 會溢出（overflow sweep 量到 +21px），所以手機用
 * text-2xl、md 起才放大。顏色一律 --foreground（§12.5），語義交給徽章。
 */
export function StatValue({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xl font-bold leading-none tabular-nums text-foreground md:text-3xl">
      {children}
    </p>
  );
}
