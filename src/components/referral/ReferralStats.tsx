import { Card, CardContent } from '../ui/card';
import { Users } from 'lucide-react';

interface ReferralStatsProps {
  firstLevelCount: number;
  secondLevelCount: number;
  thirdLevelCount: number;
}

/**
 * 推薦管理頁的統計區：一個主數字（下線總數）＋一行世代小字（ui-ux-guidelines
 * §13 第 1 條：每頁一個主數字，其餘降級）。即將到期等需要處理的人由同頁推薦樹
 * 上方的橫幅承擔，這裡不重複。手機與桌機同一套版面——原本的四張等大卡把主次
 * 拉平了，手機版也只是把同樣四個數字擠成一列。
 */
export function ReferralStats({
  firstLevelCount,
  secondLevelCount,
  thirdLevelCount,
}: ReferralStatsProps) {
  const totalReferrals = firstLevelCount + secondLevelCount + thirdLevelCount;

  return (
    <Card data-testid="referral-stats">
      <CardContent className="flex items-center gap-4 py-4 [&:last-child]:pb-4">
        <Users className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">下線總數</p>
          <p className="text-3xl font-bold leading-tight text-foreground">
            {totalReferrals}
            <span className="ml-1 text-base font-medium text-muted-foreground">位</span>
          </p>
          <p data-testid="referral-stats-generations" className="text-sm text-muted-foreground">
            一代 {firstLevelCount} · 二代 {secondLevelCount} · 三代 {thirdLevelCount}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
