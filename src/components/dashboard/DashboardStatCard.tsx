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
 * 卡內的行動提示：點擊落在整張卡的連結上（目的地相同）。primary 是整頁唯一的
 * 黑色主按鈕（由 pickPrimaryAction 決定），其餘降為 brand 次行動（§13）。
 */
export function StatCardAction({
  primary,
  children,
}: {
  primary: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      data-testid="stat-card-action"
      className={cn(
        buttonVariants({ variant: primary ? 'default' : 'brand', size: 'sm' }),
        'mt-1 w-full',
      )}
    >
      {children}
    </span>
  );
}
