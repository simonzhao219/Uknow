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
   * 卡上的連結以 aria-label 為唯一的可及名稱——必須把卡上看得到的狀態都說完
   * （標題開頭，符合 WCAG 2.5.3 名稱含可見標籤）。action 的按鈕有自己的名稱，不算在內。
   */
  ariaLabel: string;
  loading?: boolean;
  /**
   * 卡內「現在就能做、且不是導去同一頁」的真按鈕（推薦格的邀請好友／加入推薦計畫）。
   * 有給時卡片改成「標題＋數字區是連結、按鈕在連結外」——<a> 裡不能巢狀互動元素。
   * 不給時整張卡是一個連結（其餘三張卡，含立即刊登）。
   */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 會員中心的狀態卡外殼（ui-ux-guidelines §13）：卡片可點、右側 chevron，不另放重複
 * 標題的按鈕。卡內的行動提示若目的地與卡片相同（申請提領、立即刊登），用 StatCardAction
 * 畫成按鈕樣式的 span，點擊落在整張卡的連結上；要做別的事的真按鈕走 action。
 */
export function DashboardStatCard({
  to,
  title,
  icon: Icon,
  ariaLabel,
  loading,
  action,
  children,
}: DashboardStatCardProps) {
  const content = (
    <>
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
    </>
  );

  if (action) {
    // 連結只包標題＋數字區；陰影只在指到連結時浮起，指到按鈕不暗示「整張卡會導頁」。
    return (
      <Card className="h-full min-w-0 gap-2 p-4 transition-shadow has-[a:hover]:shadow-md">
        <Link
          to={to}
          aria-label={ariaLabel}
          aria-busy={loading || undefined}
          className="flex flex-col gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {content}
        </Link>
        <div className="mt-auto">{action}</div>
      </Card>
    );
  }

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className="group block min-w-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <Card className="h-full gap-2 p-4 transition-shadow group-hover:shadow-md">{content}</Card>
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
 * 墨黑的流程鈕。卡片區唯一可能的實心鈕是推薦格 action 的「加入推薦計畫」引導鈕。
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
