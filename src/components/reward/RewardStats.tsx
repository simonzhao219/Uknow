import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Award, Wallet } from 'lucide-react';

interface RewardStatsProps {
  totalRewards: number;
  availableRewards: number;
  /** 卡內「現在就能做」的行動（申請提領鈕與停用原因）。 */
  action?: ReactNode;
}

/**
 * 獎勵回饋頁的統計區（ui-ux-guidelines §13 第 1 條：內容頁一個主數字，其餘降級）。
 * 主數字是「可提領」：它是本頁唯一的淡底主區（重點與進度，§12.3），「申請提領」鈕收進這張卡；
 * 「總累積」降為一般小卡。手機單欄、可提領在上；桌機 2:1。處理中／已提領本來就不顯示。
 * 數字不能斷行（六位數點數），所以主區在手機佔滿整列，不再跟另一張卡擠 2 欄。
 */
export function RewardStats({ totalRewards, availableRewards, action }: RewardStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
      <Card
        data-testid="available-rewards-card"
        className="gap-3 border-transparent bg-brand-subtle text-brand-subtle-foreground"
      >
        <CardHeader className="px-4 pb-0 md:px-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Wallet className="h-4 w-4 shrink-0 md:h-5 md:w-5" aria-hidden="true" />
            <span className="truncate">可提領</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 md:px-6">
          <p className="text-3xl font-bold leading-tight tabular-nums md:text-4xl">
            {availableRewards}P
          </p>
          {action}
        </CardContent>
      </Card>

      <Card data-testid="total-rewards-card" className="gap-2">
        <CardHeader className="px-4 pb-0 md:px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">總累積</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          <p className="text-xl font-semibold tabular-nums text-foreground">{totalRewards}P</p>
        </CardContent>
      </Card>
    </div>
  );
}
